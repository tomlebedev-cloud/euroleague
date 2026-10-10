"""
Download real Euroleague data from the official API and write js/data.js.

    python update_data.py            # current season (2026-27)
    python update_data.py E2025      # another season, e.g. 2025-26
    python update_data.py --if-new   # quick check: only update when a game has finished since last time

Only uses the Python standard library. Re-run whenever you want fresh
results, standings, rosters and stats.
"""

import json
import re
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import model

SEASON_CODE = next((a for a in sys.argv[1:] if not a.startswith("-")), "E2026")
API = f"https://api-live.euroleague.net/v2/competitions/E/seasons/{SEASON_CODE}"
OUT = Path(__file__).parent / "js" / "data.js"
# Box scores of finished games never change, so they are saved here and not downloaded again.
CACHE = Path(__file__).parent / ".cache" / SEASON_CODE


def get(path, attempts=5):
    req = urllib.request.Request(API + path, headers={"User-Agent": "euroleague-hub"})
    for i in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 429 or i == attempts - 1:
                raise
            wait = int(e.headers.get("Retry-After") or 30)
            print(f"  API rate limit reached, waiting {wait}s...", flush=True)
            time.sleep(wait + 1)


def get_box(game_code):
    file = CACHE / f"box_{game_code}.json"
    if file.exists():
        return json.loads(file.read_text(encoding="utf-8"))
    data = get(f"/games/{game_code}/stats")
    CACHE.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(data), encoding="utf-8")
    return data


def nice_name(api_name):
    """'VALANCIUNAS, JONAS' -> 'Jonas Valanciunas'"""
    last, _, first = api_name.partition(", ")
    words = f"{first} {last}".strip().title().split()
    fixed = []
    for w in words:
        if w.upper() in ("II", "III", "IV") or (len(w) == 2 and not any(c in "AEIOUaeiou" for c in w)):
            w = w.upper()  # III, PJ, TJ, CJ
        fixed.append(w)
    # McIntyre, McCollum
    return re.sub(r"(?<![A-Za-z])Mc([a-z])", lambda m: "Mc" + m.group(1).upper(), " ".join(fixed))


# extra per-player numbers taken from the box scores: our name -> API name
PLAYER_EXTRA = {"m2": "fieldGoalsMade2", "a2": "fieldGoalsAttempted2", "m3": "fieldGoalsMade3",
                "a3": "fieldGoalsAttempted3", "mf": "freeThrowsMade", "af": "freeThrowsAttempted",
                "tov": "turnovers", "pm": "plusMinus"}


def new_results():
    """True if the API has a finished game (or a changed score) that js/data.js doesn't have yet."""
    m = re.search(r"^const GAMES = (.*);$", OUT.read_text(encoding="utf-8"), re.M) if OUT.exists() else None
    if not m:
        return True
    have = {g["code"]: g["score"] for g in json.loads(m.group(1)) if g["score"]}
    now = {g["gameCode"]: [g["local"]["score"], g["road"]["score"]] for g in get("/games")["data"] if g["played"]}
    return have != now


def main():
    print(f"Season {SEASON_CODE}")
    if "--if-new" in sys.argv and not new_results():
        print("  no newly finished games, nothing to do")
        return

    # ---- Clubs ----
    clubs = get("/clubs")["data"]
    teams = {}
    for c in clubs:
        teams[c["code"]] = {
            "id": c["code"],
            "short": c.get("tvCode") or c["code"],
            "name": c.get("abbreviatedName") or c["name"],
            "fullName": c["name"],
            "city": (c.get("city") or "").title(),
            "country": (c.get("country") or {}).get("name", ""),
            "crest": (c.get("images") or {}).get("crest", ""),
            "coach": "",
            "players": {},
        }
    print(f"  {len(teams)} teams")

    # ---- Rosters ----
    def roster(code):
        return code, get(f"/clubs/{code}/people")

    with ThreadPoolExecutor(4) as pool:
        for code, people in pool.map(roster, teams):
            for p in people:
                if not p.get("active"):
                    continue
                person = p["person"]
                if p["type"] == "E":  # head coach ("Entrenador")
                    teams[code]["coach"] = nice_name(person["name"])
                elif p["type"] == "J":
                    teams[code]["players"][person["code"]] = {
                        "code": person["code"],
                        "name": nice_name(person["name"]),
                        "num": p.get("dorsal") or "",
                        "pos": p.get("positionName") or "",
                        "nat": (person.get("country") or {}).get("code", ""),
                    }

    roster = {code: set(t["players"]) for code, t in teams.items()}  # current squads, for the model

    # ---- Games ----
    raw_games = sorted(get("/games")["data"], key=lambda g: (g["round"], g["utcDate"]))
    played = [g for g in raw_games if g["played"]]
    print(f"  {len(raw_games)} games, {len(played)} played")

    # ---- Box scores for played games ----
    def box(game):
        return game["gameCode"], get_box(game["gameCode"])

    with ThreadPoolExecutor(4) as pool:
        boxes = dict(pool.map(box, played))

    totals = defaultdict(lambda: defaultdict(float))  # (team, player) -> summed stats
    team_totals = defaultdict(lambda: defaultdict(float))  # team -> summed team stats
    games = []
    for g in raw_games:
        home, away = g["local"]["club"]["code"], g["road"]["club"]["code"]
        game = {
            "code": g["gameCode"],
            "round": g["round"],
            "date": g["localDate"],
            "utc": g["utcDate"],
            "venue": ((g.get("venue") or {}).get("name") or "").title(),
            "home": home,
            "away": away,
            "score": None,
        }
        if g["phaseType"]["code"] == "FF" or g.get("isNeutralVenue"):
            game["neutral"] = True
        if g["phaseType"]["code"] != "RS":
            game["phase"] = g["phaseType"]["code"]  # play-in / playoffs / final four: not in the standings
        if g["played"]:
            game["score"] = [g["local"]["score"], g["road"]["score"]]
            game["quarters"] = [
                [g[side]["partials"][f"partials{i}"] for i in range(1, 5)]
                + list((g[side]["partials"].get("extraPeriods") or {}).values())
                for side in ("local", "road")
            ]
            game["box"] = {}
            for side, team in (("local", home), ("road", away)):
                lines = []
                for p in boxes[g["gameCode"]][side]["players"]:
                    s, person = p["stats"], p["player"]["person"]
                    secs = s.get("timePlayed") or 0
                    line = {
                        "name": nice_name(person["name"]),
                        "num": p["player"].get("dorsal") or "",
                        "min": round(secs / 60, 1),
                        "pts": s["points"], "reb": s["totalRebounds"], "ast": s["assistances"],
                        "stl": s["steals"], "blk": s["blocksFavour"], "pir": s["valuation"],
                    }
                    # the player's code comes last: it links the line to his page on the site
                    lines.append([line[k] for k in ("name", "num", "min", "pts", "reb", "ast", "stl", "blk", "pir")]
                                 + [person["code"]])
                    if secs > 0:
                        t = totals[(team, person["code"])]
                        t["gp"] += 1
                        for k in ("min", "pts", "reb", "ast", "stl", "blk", "pir"):
                            t[k] += line[k]
                        for k, api_key in PLAYER_EXTRA.items():
                            t[k] += s.get(api_key) or 0
                        # players who left the club still show up with their stats
                        teams[team]["players"].setdefault(person["code"], {
                            "code": person["code"], "name": line["name"], "num": line["num"],
                            "pos": p["player"].get("positionName") or "",
                            "nat": (person.get("country") or {}).get("code", ""),
                        })
                game["box"]["home" if side == "local" else "away"] = lines
            # team totals, own and opponent's, for the team statistics page
            ct = model.compact_totals(boxes[g["gameCode"]])
            poss = (model.possessions(ct["home"]) + model.possessions(ct["away"])) / 2
            for side, api_side, team, other in (("home", "local", home, "away"), ("away", "road", away, "home")):
                tt = team_totals[team]
                tt["gp"] += 1
                tt["poss"] += poss
                for i, v in enumerate(ct[side]):
                    tt[f"own{i}"] += v
                for i, v in enumerate(ct[other]):
                    tt[f"opp{i}"] += v
                tot = boxes[g["gameCode"]][api_side]["total"]
                for k, api_key in (("ast", "assistances"), ("stl", "steals"), ("blk", "blocksFavour")):
                    tt[k] += tot.get(api_key) or 0
        games.append(game)

    # ---- Per-game averages ----
    for team in teams.values():
        for code, pl in team["players"].items():
            t = totals.get((team["id"], code))
            gp = int(t["gp"]) if t else 0
            pl["gp"] = gp
            for k in ("min", "pts", "reb", "ast", "stl", "blk", "pir", "tov", "pm"):
                pl[k] = round(t[k] / gp, 1) if gp else 0
            # shooting totals [2PM, 2PA, 3PM, 3PA, FTM, FTA]; the site turns them into percentages
            pl["sh"] = [int(t[k]) for k in ("m2", "a2", "m3", "a3", "mf", "af")] if gp else [0] * 6
        team["players"] = sorted(team["players"].values(), key=lambda p: (-p["gp"], -p["pts"], p["name"]))

    # ---- Team statistics ----
    # index into model.TOTAL_KEYS: 0 2PM, 1 2PA, 2 3PM, 3 3PA, 4 FTM, 5 FTA, 6 OREB, 7 DREB, 8 TOV, 9 PTS
    def pct(made, att):
        return round(100 * made / att, 1) if att else 0

    team_stats = {}
    for code, tt in team_totals.items():
        n, poss = tt["gp"], tt["poss"]
        o = [tt[f"own{i}"] for i in range(10)]
        p = [tt[f"opp{i}"] for i in range(10)]
        team_stats[code] = {
            "gp": int(n),
            "pts": round(o[9] / n, 1), "opp": round(p[9] / n, 1),
            "ortg": round(100 * o[9] / poss, 1), "drtg": round(100 * p[9] / poss, 1),
            "net": round(100 * (o[9] - p[9]) / poss, 1), "pace": round(poss / n, 1),
            "p2": pct(o[0], o[1]), "p3": pct(o[2], o[3]), "ft": pct(o[4], o[5]),
            "efg": pct(o[0] + 1.5 * o[2], o[1] + o[3]), "oefg": pct(p[0] + 1.5 * p[2], p[1] + p[3]),
            "reb": round((o[6] + o[7]) / n, 1), "orebp": pct(o[6], o[6] + p[7]),
            "ast": round(tt["ast"] / n, 1), "tov": round(o[8] / n, 1),
            "stl": round(tt["stl"] / n, 1), "blk": round(tt["blk"] / n, 1),
        }

    # ---- Prediction model (see model.py) ----
    print("  fitting prediction model...")
    prior = model.preseason_prior(SEASON_CODE, roster)
    model_games = model.simplify_games(raw_games)
    by_code = {g["code"]: g for g in games}
    record = [0, 0]
    for raw in raw_games:
        if not raw["played"]:
            continue
        # what the model would have said before this game (only earlier games known)
        day = model.parse_date(raw["utcDate"]).replace(hour=0, minute=0)
        r = model.fit(model_games, teams, prior, as_of=day)
        hp, ap, p = r.predict(raw["local"]["club"]["code"], raw["road"]["club"]["code"], by_code[raw["gameCode"]].get("neutral", False))
        by_code[raw["gameCode"]]["pred"] = [round(hp), round(ap), round(p, 3)]
        record[0] += (p >= 0.5) == (raw["local"]["score"] > raw["road"]["score"])
        record[1] += 1
    ratings = model.fit(model_games, teams, prior)

    # who plays: each team's regulars, their value, and who missed the latest game
    # and how fast each team plays (possessions per game), for predicted totals
    av = model.Availability(model.history_player_totals(model.previous(SEASON_CODE)))
    pace = model.Pace()
    for raw in sorted(played, key=lambda g: g["utcDate"]):
        home, away = raw["local"]["club"]["code"], raw["road"]["club"]["code"]
        box = model.compact_box(boxes[raw["gameCode"]])
        av.add(home, box["home"])
        av.add(away, box["away"])
        pace.add(home, away, model.compact_totals(boxes[raw["gameCode"]]))
    model_json = ratings.to_json(teams)
    # season forecast: play out the rest of the regular season (model.simulate_season)
    rs = [g for g in raw_games if g["phaseType"]["code"] == "RS"]
    forecast = model.simulate_season(
        ratings, teams,
        [(g["local"]["club"]["code"], g["road"]["club"]["code"], g["local"]["score"] - g["road"]["score"])
         for g in rs if g["played"]],
        [(g["local"]["club"]["code"], g["road"]["club"]["code"]) for g in rs if not g["played"]])
    # team -> [chance of finishing 1-6, chance of finishing 7-10, expected final wins]
    model_json["forecast"] = {t: [round(v[0], 3), round(v[1], 3), round(v[2], 1)] for t, v in forecast.items()}
    model_json["forecastGames"] = len(rs) * 2 // len(teams) if teams else 0
    model_json["pace"] = {t: round(pace.team(t), 2) for t in teams}
    # teams that weren't in last season's EuroLeague: their starting rating is only a rough guess
    # Official regular-season order (EuroLeague tie-breakers: head-to-head and so on), which the site
    # can't always work out from wins and point difference alone.
    official = None
    rs_rounds = [g["round"] for g in played if g["phaseType"]["code"] == "RS"]
    if rs_rounds:
        try:
            url = f"https://api-live.euroleague.net/v3/competitions/E/seasons/{SEASON_CODE}/rounds/{max(rs_rounds)}/basicstandings"
            official = {"round": max(rs_rounds),
                        "teams": {t["club"]["code"]: [t["position"], t["gamesPlayed"], t["gamesWon"]]
                                  for t in model.fetch_json(url, attempts=3)["teams"]}}
        except Exception as e:  # the site then falls back to its own order
            print(f"  official standings not available ({e})")

    new_teams = sorted(set(teams) - model.season_teams(model.history_games(model.previous(SEASON_CODE))))

    availability = {}
    for code in teams:
        regs = av.regulars(code)
        last = av.last_played.get(code, set())
        availability[code] = [
            # [player, PIR per game, missed the latest game, no longer on the roster]
            [c, round(v, 1), c not in last, c not in roster[code]]
            for c, v in sorted(regs.items(), key=lambda x: -x[1])
        ]

    season_name = raw_games[0]["season"]["alias"] if raw_games else SEASON_CODE
    updated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    js = (
        "// Generated by update_data.py from the official Euroleague API — do not edit by hand.\n"
        f"const SEASON = {json.dumps(season_name)};\n"
        f"const UPDATED = {json.dumps(updated)};\n"
        f"const TEAMS = {json.dumps(sorted(teams.values(), key=lambda t: t['name']), ensure_ascii=False)};\n"
        f"const GAMES = {json.dumps(games, ensure_ascii=False, separators=(',', ':'))};\n"
        f"const MODEL = {json.dumps(model_json)};\n"
        f"const NEW_TEAMS = {json.dumps(new_teams)};\n"
        f"const OFFICIAL = {json.dumps(official)};\n"
        f"const TEAM_STATS = {json.dumps(team_stats, separators=(',', ':'))};\n"
        f"const AVAILABILITY = {json.dumps(availability, separators=(',', ':'))};\n"
    )
    OUT.write_text(js, encoding="utf-8")
    print(f"Wrote {OUT} ({len(js) // 1024} KB)")


if __name__ == "__main__":
    main()
