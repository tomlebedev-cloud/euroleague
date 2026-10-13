"""
Experiment: does a team's form in its domestic league help predict its EuroLeague games?

Result (2026-10-13): no. On 2023-24 and 2024-25, three ways of using domestic results (change in
domestic strength since last season, form over the last 5 domestic games, domestic strength itself)
left log loss and margin error unchanged or worse, with effects well inside their uncertainty.
So the website's model does not use domestic leagues. This file is kept to repeat the test.

Data: API-Sports (api-basketball). The free plan gives 100 requests a day and only seasons
2022 to 2024; the current season needs a paid plan. The key goes in the file apisports.key
(git-ignored) or the APISPORTS_KEY environment variable. Every answer is saved in .cache/apisports/.

    python domestic.py test           # the experiment (downloads 27 league seasons once)
    python domestic.py leagues        # list leagues of the countries we need
    python domestic.py status         # requests used today
"""

import hashlib
import itertools
import json
import math
import os
import statistics
import sys
import time
from datetime import datetime
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://v1.basketball.api-sports.io"
ROOT = Path(__file__).parent
CACHE = ROOT / ".cache" / "apisports"


def api_key():
    key = os.environ.get("APISPORTS_KEY") or ""
    f = ROOT / "apisports.key"
    if not key and f.exists():
        key = f.read_text(encoding="utf-8-sig").strip()
    if not key:
        raise SystemExit("No API key: put it in apisports.key or the APISPORTS_KEY environment variable.")
    return key


def get(path, max_age_hours=None, **params):
    """GET with caching. max_age_hours=None keeps the saved answer forever."""
    url = f"{API}/{path}?{urllib.parse.urlencode(sorted(params.items()))}"
    f = CACHE / (hashlib.sha1(url.encode()).hexdigest()[:16] + ".json")
    if f.exists() and (max_age_hours is None or time.time() - f.stat().st_mtime < max_age_hours * 3600):
        return json.loads(f.read_text(encoding="utf-8"))
    req = urllib.request.Request(url, headers={"x-apisports-key": api_key(), "User-Agent": "euroleague-hub"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
    if data.get("errors"):
        raise RuntimeError(f"{path} {params}: {data['errors']}")
    CACHE.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data), encoding="utf-8")
    time.sleep(7)  # free plan: 10 requests a minute
    return data


# EuroLeague club -> (league id, part of the team's name in that league)
CLUBS = {
    "ASV": (2, "villeurbanne"), "MCO": (2, "monaco"), "PRS": (2, "paris"),
    "BAR": (117, "barcelona"), "BAS": (117, "baskonia"), "MAD": (117, "real madrid"), "PAM": (117, "valencia"),
    "BER": (40, "alba"), "MUN": (40, "bayern"),
    "IST": (104, "efes"), "ULK": (104, "fenerbahce"),
    "MIL": (52, "milano"), "VIR": (52, "virtus bologna"),
    "OLY": (45, "olympiacos"), "PAN": (45, "panathinaikos"),
    "PAR": (198, "partizan"), "RED": (198, "crvena"),
    "TEL": (51, "maccabi tel"), "ZAL": (60, "zalgiris"),
}
SPLIT = {198, 86}  # leagues whose season is named by one year


def league_games(lid, year):
    season = str(year) if lid in SPLIT else f"{year}-{year + 1}"
    out = []
    for x in get("games", league=lid, season=season)["response"]:
        if x["status"]["short"] not in ("FT", "AOT") or x["scores"]["home"]["total"] is None:
            continue
        out.append({"code": x["id"], "date": datetime.fromisoformat(x["date"]).replace(tzinfo=None),
                    "home": x["teams"]["home"]["name"], "away": x["teams"]["away"]["name"],
                    "hs": x["scores"]["home"]["total"], "as": x["scores"]["away"]["total"], "neutral": False})
    out.sort(key=lambda g: g["date"])
    return out


def find(names, part):
    m = [n for n in names if part in n.lower()]
    assert len(m) == 1, (part, m)
    return m[0]


def net(r, team):
    return r.off[team] - r.dfn[team]


def season_rows(s, prior_strength=6.0, recent=5):
    year = int(s[1:])
    preds = bt.season_predictions(s)
    leagues = {}
    for lid in {v[0] for v in CLUBS.values()}:
        cur, last = league_games(lid, year), league_games(lid, year - 1)
        last_r = model.fit(last, model.season_teams(last), None, prior_strength=prior_strength, half_life=0)
        leagues[lid] = (cur, model.season_teams(cur), last_r)
    rows = []
    for date, day in itertools.groupby(preds, key=lambda x: x[0]["date"].date()):
        day = list(day)
        as_of = day[0][0]["date"].replace(hour=0, minute=0)
        fits = {}
        feats = {}
        for g, hp, ap in day:
            f = {}
            for side in ("home", "away"):
                club = g[side]
                lid, part = CLUBS[club]
                cur, teams, last_r = leagues[lid]
                if lid not in fits:
                    # this season's domestic rating so far, starting from last season's
                    prior = model.Ratings(last_r.avg, {t: last_r.off.get(t, -2.0) for t in teams},
                                          {t: last_r.dfn.get(t, 2.0) for t in teams})
                    fits[lid] = model.fit(cur, teams, prior, as_of=as_of, prior_strength=prior_strength, half_life=0)
                r = fits[lid]
                name = find(teams, part)
                before = [x for x in cur if x["date"] < as_of and name in (x["home"], x["away"])]
                last_name = [n for n in last_r.off if part in n.lower()]
                change = net(r, name) - (net(last_r, last_name[0]) if last_name else net(r, name))
                # recent form: last games' margin vs what the domestic ratings expected
                form = 0.0
                for x in before[-recent:]:
                    hp_, ap_, _ = r.predict(x["home"], x["away"])
                    res = (x["hs"] - x["as"]) - (hp_ - ap_)
                    form += res if x["home"] == name else -res
                f[side] = {"change": change if before else 0.0, "form": form / max(len(before[-recent:]), 1),
                           "level": net(r, name), "n": len(before)}
            feats[g["code"]] = f
        rows += [(g, hp, ap, feats[g["code"]]) for g, hp, ap in day]
    return rows




def xy(rows, key):
    X = [f["home"][key] - f["away"][key] for g, hp, ap, f in rows]
    Y = [(g["hs"] - g["as"]) - (hp - ap) - sim["marginBias"] for g, hp, ap, f in rows]
    return X, Y


def slope(X, Y):
    sxx = sum(x * x for x in X)
    b = sum(x * y for x, y in zip(X, Y)) / sxx
    se = math.sqrt(sum((y - b * x) ** 2 for x, y in zip(X, Y)) / (len(X) - 1) / sxx)
    return b, se


def score(rows, key, c):
    ll = mae = right = 0
    for g, hp, ap, f in rows:
        m = hp - ap + (c * (f["home"][key] - f["away"][key]) if key else 0)
        mae += abs(g["hs"] - g["as"] - m)
        right += (m + sim["marginBias"] > 0) == (g["hs"] > g["as"])
        p = min(max(N.cdf((m + sim["marginBias"]) / sim["sdMargin"]), 1e-6), 1 - 1e-6)
        ll -= math.log(p if g["hs"] > g["as"] else 1 - p)
    n = len(rows)
    return ll / n, mae / n, right / n


def test():
    import backtest as bt
    import model
    globals().update(bt=bt, model=model, sim=model.SIM, N=statistics.NormalDist())
    seasons = ["E2023", "E2024"]  # the seasons the free plan covers, each with the one before it
    rows = {s: season_rows(s) for s in seasons}
    for s in seasons:
        print(f"{s} without domestic leagues: log loss %.4f, margin error %.2f, winners %.1f%%"
              % (lambda r: (r[0], r[1], 100 * r[2]))(score(rows[s], None, 0)))
    for key, name in (("change", "change in domestic strength since last season"),
                      ("form", "last 5 domestic games vs expectation"), ("level", "domestic strength")):
        print(name)
        for t in seasons:
            c, se = slope(*xy([r for s in seasons if s != t for r in rows[s]], key))
            ll, mae, acc = score(rows[t], key, c)
            print(f"  effect {c:+.3f} ± {se:.3f} (from the other season) -> {t}: log loss {ll:.4f}, "
                  f"margin error {mae:.2f}, winners {100 * acc:.1f}%")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "test":
        test()
    elif cmd == "status":
        print(get("status", max_age_hours=0)["response"]["requests"])
    elif cmd == "leagues":
        wanted = {"Spain", "Greece", "Turkey", "Italy", "Germany", "France", "Israel", "Lithuania", "Serbia",
                  "Europe", "World", "United-Arab-Emirates"}
        for lg in get("leagues")["response"]:
            if lg["country"]["name"] in wanted:
                seasons = [s["season"] for s in lg["seasons"]]
                print(lg["id"], lg["country"]["name"], "|", lg["name"], "|", lg["type"], "|", seasons[-1], "…", seasons[0], len(seasons))
