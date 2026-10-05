"""
Download real Euroleague data from the official API and write js/data.js.

    python update_data.py            # current season (2026-27)
    python update_data.py E2025      # another season, e.g. 2025-26

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

SEASON_CODE = sys.argv[1] if len(sys.argv) > 1 else "E2026"
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


def main():
    print(f"Season {SEASON_CODE}")

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
                    lines.append([line[k] for k in ("name", "num", "min", "pts", "reb", "ast", "stl", "blk", "pir")])
                    if secs > 0:
                        t = totals[(team, person["code"])]
                        t["gp"] += 1
                        for k in ("min", "pts", "reb", "ast", "stl", "blk", "pir"):
                            t[k] += line[k]
                        # players who left the club still show up with their stats
                        teams[team]["players"].setdefault(person["code"], {
                            "code": person["code"], "name": line["name"], "num": line["num"],
                            "pos": p["player"].get("positionName") or "",
                            "nat": (person.get("country") or {}).get("code", ""),
                        })
                game["box"]["home" if side == "local" else "away"] = lines
        games.append(game)

    # ---- Per-game averages ----
    for team in teams.values():
        for code, pl in team["players"].items():
            t = totals.get((team["id"], code))
            gp = int(t["gp"]) if t else 0
            pl["gp"] = gp
            for k in ("min", "pts", "reb", "ast", "stl", "blk", "pir"):
                pl[k] = round(t[k] / gp, 1) if gp else 0
        team["players"] = sorted(team["players"].values(), key=lambda p: (-p["gp"], -p["pts"], p["name"]))

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
    av = model.Availability(model.history_player_totals(model.previous(SEASON_CODE)))
    for raw in sorted(played, key=lambda g: g["utcDate"]):
        box = model.compact_box(boxes[raw["gameCode"]])
        av.add(raw["local"]["club"]["code"], box["home"])
        av.add(raw["road"]["club"]["code"], box["away"])
    # teams that weren't in last season's EuroLeague: their starting rating is only a rough guess
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
        f"const MODEL = {json.dumps(ratings.to_json(teams))};\n"
        f"const NEW_TEAMS = {json.dumps(new_teams)};\n"
        f"const AVAILABILITY = {json.dumps(availability, separators=(',', ':'))};\n"
    )
    OUT.write_text(js, encoding="utf-8")
    print(f"Wrote {OUT} ({len(js) // 1024} KB)")


if __name__ == "__main__":
    main()
