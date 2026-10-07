"""
Prediction model shared by update_data.py (website) and backtest.py (accuracy testing).

Each team gets an offensive rating (points scored above league average) and a
defensive rating (points allowed above league average), estimated from all
games played so far:

    home points = league average + home advantage / 2 + home offense + away defense
    away points = league average - home advantage / 2 + away offense + home defense

The ratings are found with a weighted ridge regression:
  - opponent-adjusted: beating strong teams counts more than beating weak ones
  - recent games weigh more than old ones (RECENCY_HALF_LIFE_DAYS)
  - ratings are pulled toward a prior: last season's final rating, shrunk by
    CARRYOVER (rosters change every summer); PRIOR_STRENGTH is worth
    "this many games" of evidence, so early-season predictions lean on last
    season and later ones on this season's games.

The predicted margin becomes a win probability with a logistic curve.
Parameters below were chosen with backtest.py on past seasons.
"""

import json
import math
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

HOME_ADVANTAGE = 3.0          # points
PRIOR_STRENGTH = 30.0          # games' worth of weight on the prior
CARRYOVER = 0.85               # share of last season's rating kept
RECENCY_HALF_LIFE_DAYS = 240   # a game this many days old counts half
TALENT_WEIGHT = 2.0          # net points per 1000 PIR of roster change
NEW_TEAM_PRIOR = (-1.0, 1.0)  # (offense, defense) for teams not in last season: slightly below average
LOGISTIC_SCALE = 5.7          # margin -> probability: p = 1 / (1 + exp(-margin / scale))
DEFAULT_AVERAGE = 80.0        # league points per team per game when nothing is known

# How far real results land from the prediction (python backtest.py --spread, 1,063 games 2023-24 to 2025-26).
# The betting page simulates games with these: final margin and total ~ normal(prediction + bias, sd).
SIM = {"sdMargin": 11.5, "marginBias": 0.6, "sdTotal": 17.0, "totalBias": 1.2, "corr": 0.0}

# Missing players (python backtest.py --absences). A team's key players are its 3 regulars (played at
# least half its games) with the highest PIR per game; early in the season that leans on last season's
# PIR (worth priorGames games). Each key player who doesn't play costs his team perPlayer points of margin.
ABSENCE = {"keyPlayers": 3, "perPlayer": 1.5, "minGames": 3, "minShare": 0.5, "priorGames": 5}


def parse_date(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)


def simplify_games(raw_games):
    """API game objects -> plain dicts the model works with (played games only)."""
    out = []
    for g in raw_games:
        if not g.get("played"):
            continue
        out.append({
            "code": g["gameCode"],
            "date": parse_date(g["utcDate"]),
            "home": g["local"]["club"]["code"],
            "away": g["road"]["club"]["code"],
            "hs": g["local"]["score"],
            "as": g["road"]["score"],
            "neutral": g["phaseType"]["code"] == "FF" or bool(g.get("isNeutralVenue")),
        })
    out.sort(key=lambda g: g["date"])
    return out


def _solve(a, b):
    """Solve a·x = b (Gaussian elimination with partial pivoting)."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        m[c], m[p] = m[p], m[c]
        piv = m[c][c]
        for r in range(c + 1, n):
            f = m[r][c] / piv
            if f:
                row_r, row_c = m[r], m[c]
                for k in range(c, n + 1):
                    row_r[k] -= f * row_c[k]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        s = m[r][n] - sum(m[r][k] * x[k] for k in range(r + 1, n))
        x[r] = s / m[r][r]
    return x


class Ratings:
    def __init__(self, avg, off, dfn, hca=HOME_ADVANTAGE, scale=LOGISTIC_SCALE):
        self.avg, self.off, self.dfn, self.hca, self.scale = avg, off, dfn, hca, scale

    def predict(self, home, away, neutral=False):
        """-> (home points, away points, home win probability)"""
        h = 0 if neutral else self.hca / 2
        o, d = self.off, self.dfn
        hp = self.avg + h + o.get(home, NEW_TEAM_PRIOR[0]) + d.get(away, NEW_TEAM_PRIOR[1])
        ap = self.avg - h + o.get(away, NEW_TEAM_PRIOR[0]) + d.get(home, NEW_TEAM_PRIOR[1])
        return hp, ap, 1 / (1 + math.exp(-(hp - ap) / self.scale))

    def to_json(self, teams):
        return {
            "avg": round(self.avg, 2), "hca": self.hca, "scale": self.scale, "sim": SIM,
            "absence": {"keyPlayers": ABSENCE["keyPlayers"], "perPlayer": ABSENCE["perPlayer"]},
            "paceBeta": PACE["beta"],
            "teams": {t: [round(self.off.get(t, NEW_TEAM_PRIOR[0]), 2), round(self.dfn.get(t, NEW_TEAM_PRIOR[1]), 2)]
                      for t in teams},
        }


def fit(games, teams, prior=None, as_of=None, *, prior_strength=PRIOR_STRENGTH,
        half_life=RECENCY_HALF_LIFE_DAYS, hca=HOME_ADVANTAGE, scale=LOGISTIC_SCALE):
    """
    games: simplified played games (only those before `as_of` are used)
    teams: team codes to rate
    prior: preseason Ratings from build_prior (or None), used as-is
    """
    if as_of is not None:
        games = [g for g in games if g["date"] < as_of]
    ref = as_of or (games[-1]["date"] if games else None)
    teams = sorted(teams)
    idx = {t: i for i, t in enumerate(teams)}
    n = len(teams)

    def weight(g):
        return 0.5 ** ((ref - g["date"]).days / half_life) if half_life else 1.0

    # league average: this season's games, blended with last season's average early on
    prior_avg = prior.avg if prior else DEFAULT_AVERAGE
    wsum = sum(2 * weight(g) for g in games)
    psum = sum(weight(g) * (g["hs"] + g["as"]) for g in games)
    k = 2 * n  # last season's average counts like two rounds of games
    avg = (psum + prior_avg * k) / (wsum + k)

    def prior_of(t):
        if prior and t in prior.off:
            return prior.off[t], prior.dfn[t]
        return NEW_TEAM_PRIOR

    # unknowns: offense[0..n-1], defense[n..2n-1]; normal equations A x = b
    size = 2 * n
    a = [[0.0] * size for _ in range(size)]
    b = [0.0] * size
    for t in teams:
        po, pd = prior_of(t)
        i = idx[t]
        a[i][i] += prior_strength
        b[i] += prior_strength * po
        a[n + i][n + i] += prior_strength
        b[n + i] += prior_strength * pd
    for g in games:
        if g["home"] not in idx or g["away"] not in idx:
            continue
        w = weight(g)
        h = 0 if g["neutral"] else hca / 2
        hi, ai = idx[g["home"]], idx[g["away"]]
        # home points = avg + h + off[home] + def[away]; away points = avg - h + off[away] + def[home]
        for off_i, def_j, y in ((hi, n + ai, g["hs"] - avg - h), (ai, n + hi, g["as"] - avg + h)):
            a[off_i][off_i] += w
            a[def_j][def_j] += w
            a[off_i][def_j] += w
            a[def_j][off_i] += w
            b[off_i] += w * y
            b[def_j] += w * y
    x = _solve(a, b)
    return Ratings(avg, {t: x[idx[t]] for t in teams}, {t: x[n + idx[t]] for t in teams}, hca, scale)


# Shooting luck (python backtest.py --luck). Three-point and free-throw percentages swing a lot from game
# to game and mostly by chance, so ratings are fitted on scores with part of that luck taken out:
#   points - three * 3 * (3PM - 3PA * league 3P%) - free * (FTM - FTA * league FT%)
LUCK = {"three": 0.0, "free": 0.0}


def luck_adjusted(games, totals, three=None, free=None):
    """games (simplify_games) -> copies with shooting luck partly removed from the scores.
    totals: game code -> compact_totals; games without totals stay as they are.
    League percentages are this season's so far (only earlier games)."""
    three = LUCK["three"] if three is None else three
    free = LUCK["free"] if free is None else free
    if not three and not free:
        return games
    made = [0.0, 0.0, 0.0, 0.0]  # 3PM, 3PA, FTM, FTA so far
    out = []
    for g in games:
        t = totals.get(g["code"])
        if not t:
            out.append(g)
            continue
        p3 = made[0] / made[1] if made[1] > 500 else 0.355
        pft = made[2] / made[3] if made[3] > 500 else 0.77
        adj = []
        for side in ("home", "away"):
            _, _, m3, a3, mft, aft, *_ = t[side]
            adj.append(-three * 3 * (m3 - a3 * p3) - free * (mft - aft * pft))
        out.append({**g, "hs": g["hs"] + adj[0], "as": g["as"] + adj[1]})
        for side in ("home", "away"):
            _, _, m3, a3, mft, aft, *_ = t[side]
            made[0] += m3; made[1] += a3; made[2] += mft; made[3] += aft
    return out


# Pace (python backtest.py --pace). A team's pace = its games' possessions above the league average so far,
# shrunk toward the league with `shrink` games of weight. The ratings already predict points; fast or slow
# teams add beta * (home pace + away pace) points to the predicted total (the margin doesn't change).
PACE = {"beta": 1.3, "shrink": 5}


def possessions(t):
    """compact_totals side -> possessions"""
    return t[1] + t[3] + 0.44 * t[5] - t[6] + t[8]


class Pace:
    def __init__(self, shrink=None):
        self.k = PACE["shrink"] if shrink is None else shrink
        self.sum, self.n, self.league = {}, {}, []

    def league_pace(self):
        return sum(self.league) / len(self.league) if len(self.league) >= 5 else 72.0

    def team(self, team):
        lg = self.league_pace()
        return (self.sum.get(team, 0) + self.k * lg) / (self.n.get(team, 0) + self.k) - lg

    def add(self, home, away, totals):
        p = (possessions(totals["home"]) + possessions(totals["away"])) / 2
        self.league.append(p)
        for t in (home, away):
            self.sum[t] = self.sum.get(t, 0) + p
            self.n[t] = self.n.get(t, 0) + 1


class Availability:
    """
    Follows a season game by game and knows, before each game, every team's regulars and their value.
        av = Availability(history_player_totals(last season))
        av.key_players_out(team, players_who_play)   # before the game
        av.add(team, box_lines)                      # after it: [[player code, seconds, PIR], ...]
    """

    def __init__(self, last_season=None, min_games=None, min_share=None, prior_games=None):
        """last_season: player code -> (games, minutes, PIR) last season, from history_player_totals"""
        self.min_games = ABSENCE["minGames"] if min_games is None else min_games
        self.min_share = ABSENCE["minShare"] if min_share is None else min_share
        self.prior_games = ABSENCE["priorGames"] if prior_games is None else prior_games
        self.prior = {c: pir / n for c, (n, _, pir) in (last_season or {}).items() if n >= 5}
        self.team_games = {}
        self.stats = {}        # (team, player) -> [games, PIR]
        self.last_played = {}  # team -> players who played its latest game

    def value(self, team, player):
        """PIR per game, leaning on last season's early on"""
        n, pir = self.stats[(team, player)]
        if player in self.prior:
            k = self.prior_games
            return (pir + k * self.prior[player]) / (n + k)
        return pir / n

    def regulars(self, team):
        """-> {player: value} for players who played at least minShare of the team's games"""
        tg = self.team_games.get(team, 0)
        if tg < self.min_games:
            return {}
        return {c: self.value(t, c) for (t, c), (n, _) in self.stats.items()
                if t == team and n >= self.min_games and n / tg >= self.min_share}

    def key_players(self, team, k=None):
        regs = self.regulars(team)
        return sorted(regs, key=lambda c: -regs[c])[:k or ABSENCE["keyPlayers"]]

    def key_players_out(self, team, playing, k=None):
        return sum(c not in playing for c in self.key_players(team, k))

    def add(self, team, lines):
        self.team_games[team] = self.team_games.get(team, 0) + 1
        for c, secs, pir in lines:
            if secs > 0:
                st = self.stats.setdefault((team, c), [0, 0.0])
                st[0] += 1
                st[1] += pir
        self.last_played[team] = {c for c, secs, _ in lines if secs > 0}


def absence_effect(home_out, away_out, per_player=None):
    """key players out -> (home points change, away points change); the total stays the same"""
    d = (ABSENCE["perPlayer"] if per_player is None else per_player) * (away_out - home_out) / 2
    return d, -d


def season_teams(games):
    return {g["home"] for g in games} | {g["away"] for g in games}


# ---------- Past seasons (finished, so cached forever) ----------
HISTORY = Path(__file__).parent / ".cache" / "history"
API_V2 = "https://api-live.euroleague.net/v2/competitions/E/seasons/{season}/games"
API_PLAYERS = ("https://api-live.euroleague.net/v3/competitions/E/statistics/players/traditional"
               "?seasonMode=Single&seasonCode={season}&statisticMode=Accumulated&limit=1000")


def fetch_json(url, attempts=20):
    """GET with waiting on the API's rate limit."""
    req = urllib.request.Request(url, headers={"User-Agent": "euroleague-hub"})
    for i in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 429 or i == attempts - 1:
                raise
            wait = int(e.headers.get("Retry-After") or 30)
            print(f"  API rate limit reached, waiting {wait}s...", flush=True)
            time.sleep(wait + 1)
        except (urllib.error.URLError, TimeoutError) as e:  # connection dropped: wait and try again
            if i == attempts - 1:
                raise
            print(f"  connection problem ({e}), retrying in 60s...", flush=True)
            time.sleep(60)


def _cached(name, url):
    f = HISTORY / name
    if not f.exists():
        HISTORY.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps(fetch_json(url)), encoding="utf-8")
    return json.loads(f.read_text(encoding="utf-8"))


def history_games(season):
    return simplify_games(_cached(f"{season}.json", API_V2.format(season=season))["data"])


def history_players(season):
    """-> list of (player code, team code, games, total PIR) for a finished season"""
    data = _cached(f"players_{season}.json", API_PLAYERS.format(season=season))["players"]
    return [(p["player"]["code"], p["player"]["team"]["code"], p["gamesPlayed"], p["pir"]) for p in data]


def history_player_totals(season):
    """player code -> (games, minutes, PIR) over a finished season (all clubs)"""
    data = _cached(f"players_{season}.json", API_PLAYERS.format(season=season))["players"]
    out = {}
    for p in data:
        n, mins, pir = out.get(p["player"]["code"], (0, 0.0, 0.0))
        out[p["player"]["code"]] = (n + p["gamesPlayed"], mins + p["minutesPlayed"], pir + p["pir"])
    return out


def compact_box(box):
    """API box score -> {"home": [[player code, seconds, PIR], ...], "away": [...]} (players listed for the game)"""
    return {side: [[p["player"]["person"]["code"], p["stats"].get("timePlayed") or 0, p["stats"]["valuation"]]
                   for p in box[api_side]["players"]]
            for side, api_side in (("home", "local"), ("away", "road"))}


def history_boxes(season):
    """game code -> compact box score, for every played game of a finished season.
    Each game is saved as soon as it is downloaded, so an interrupted download resumes."""
    folder = HISTORY / f"boxes_{season}"
    folder.mkdir(parents=True, exist_ok=True)
    url = f"https://api-live.euroleague.net/v2/competitions/E/seasons/{season}/games/{{}}/stats"

    def one(code):
        f = folder / f"{code}.json"
        if not f.exists():
            f.write_text(json.dumps(compact_box(fetch_json(url.format(code)))), encoding="utf-8")
        return code, json.loads(f.read_text(encoding="utf-8"))

    codes = [g["code"] for g in history_games(season)]
    missing = sum(not (folder / f"{c}.json").exists() for c in codes)
    if missing:
        print(f"  downloading {missing} box scores of {season}...", flush=True)
    with ThreadPoolExecutor(2) as pool:
        return dict(pool.map(one, codes))


TOTAL_KEYS = ("fieldGoalsMade2", "fieldGoalsAttempted2", "fieldGoalsMade3", "fieldGoalsAttempted3",
              "freeThrowsMade", "freeThrowsAttempted", "offensiveRebounds", "defensiveRebounds", "turnovers", "points")


def compact_totals(box):
    """API box score -> {"home": [2PM, 2PA, 3PM, 3PA, FTM, FTA, OREB, DREB, TOV, PTS], "away": [...]}"""
    return {side: [box[api_side]["total"].get(k) or 0 for k in TOTAL_KEYS]
            for side, api_side in (("home", "local"), ("away", "road"))}


def history_team_totals(season):
    """game code -> team totals (compact_totals) for every played game of a finished season.
    Each game is saved as soon as it is downloaded, so an interrupted download resumes."""
    folder = HISTORY / f"totals_{season}"
    folder.mkdir(parents=True, exist_ok=True)
    url = f"https://api-live.euroleague.net/v2/competitions/E/seasons/{season}/games/{{}}/stats"

    def one(code):
        f = folder / f"{code}.json"
        if not f.exists():
            f.write_text(json.dumps(compact_totals(fetch_json(url.format(code)))), encoding="utf-8")
        return code, json.loads(f.read_text(encoding="utf-8"))

    codes = [g["code"] for g in history_games(season)]
    missing = sum(not (folder / f"{c}.json").exists() for c in codes)
    if missing:
        print(f"  downloading {missing} team box scores of {season}...", flush=True)
    with ThreadPoolExecutor(2) as pool:
        return dict(pool.map(one, codes))


def history_roster(season):
    """team -> player codes that played at least 5 games for it"""
    roster = {}
    for code, team, games, _ in history_players(season):
        if games >= 5:
            roster.setdefault(team, set()).add(code)
    return roster


def previous(season):
    return f"E{int(season[1:]) - 1}"


# ---------- Preseason prior ----------
def build_prior(last, last_players, roster, *, carryover=CARRYOVER, talent_weight=TALENT_WEIGHT):
    """
    last:         Ratings at the end of last season
    last_players: history_players(last season)
    roster:       team -> player codes on this season's roster
    Prior = last season's rating * carryover
          + talent_weight * (last-season PIR of players who arrived - of players who left) / 1000
    """
    pir = {code: p for code, _, _, p in last_players}
    old_roster = {}
    for code, team, _, _ in last_players:
        old_roster.setdefault(team, set()).add(code)
    off, dfn = {}, {}
    for team, players in roster.items():
        old = old_roster.get(team, set())
        change = (sum(pir.get(c, 0) for c in players - old) - sum(pir.get(c, 0) for c in old - players)) / 1000
        o, d = (last.off[team] * carryover, last.dfn[team] * carryover) if team in last.off else NEW_TEAM_PRIOR
        off[team] = o + talent_weight * change / 2
        dfn[team] = d - talent_weight * change / 2
    return Ratings(last.avg, off, dfn, last.hca, last.scale)


def preseason_prior(season, roster, **params):
    """Prior for `season` from the two previous seasons and this season's roster."""
    p1, p2 = previous(season), previous(previous(season))
    fit_params = {k: v for k, v in params.items() if k not in ("carryover", "talent_weight")}
    prior_params = {k: v for k, v in params.items() if k in ("carryover", "talent_weight")}
    g2, g1 = history_games(p2), history_games(p1)
    r2 = fit(g2, season_teams(g2), None, **fit_params)
    r1_prior = build_prior(r2, history_players(p2), history_roster(p1), **prior_params)
    r1 = fit(g1, season_teams(g1), r1_prior, **fit_params)
    return build_prior(r1, history_players(p1), roster, **prior_params)
