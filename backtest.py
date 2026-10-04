"""
Measure prediction accuracy on past seasons.

    python backtest.py          # compare old vs current model
    python backtest.py --tune   # search model parameters (tuned on 2023-24 + 2024-25, checked on 2025-26)

Every game is predicted using only games played before it, exactly like the website does live.
Past seasons are downloaded once into .cache/history/.
"""

import itertools
import math
import sys
from collections import defaultdict

import model

ALL_SEASONS = ["E2021", "E2022", "E2023", "E2024", "E2025"]
TEST_SEASONS = ["E2023", "E2024", "E2025"]  # each needs the two seasons before it
TUNE_SEASONS = ["E2023", "E2024"]
CHECK_SEASONS = ["E2025"]

SEASONS = {s: model.history_games(s) for s in ALL_SEASONS}


# ---------- the old website model, for comparison ----------
def old_model_predictions(games):
    out = []
    pf, pa, gp = defaultdict(float), defaultdict(float), defaultdict(int)
    played = []
    for date, day in itertools.groupby(games, key=lambda g: g["date"].date()):
        day = list(day)
        avg = sum(g["hs"] + g["as"] for g in played) / (2 * len(played)) if played else 82
        for g in day:
            r = {}
            for t in (g["home"], g["away"]):
                r[t] = ((pf[t] + avg * 2) / (gp[t] + 2), (pa[t] + avg * 2) / (gp[t] + 2))
            hp = (r[g["home"]][0] + r[g["away"]][1]) / 2 + 1.5
            ap = (r[g["away"]][0] + r[g["home"]][1]) / 2 - 1.5
            out.append((g, hp - ap, 1 / (1 + math.exp(-(hp - ap) / 6))))
        for g in day:
            pf[g["home"]] += g["hs"]; pa[g["home"]] += g["as"]; gp[g["home"]] += 1
            pf[g["away"]] += g["as"]; pa[g["away"]] += g["hs"]; gp[g["away"]] += 1
            played.append(g)
    return out


# ---------- the new model ----------
def new_model_margins(season, **params):
    """-> list of (game, predicted margin) for every game in the season"""
    prior = model.preseason_prior(season, model.history_roster(season), **params)
    fit_params = {k: v for k, v in params.items() if k not in ("carryover", "talent_weight")}
    games = SEASONS[season]
    teams = model.season_teams(games)
    out = []
    for date, day in itertools.groupby(games, key=lambda g: g["date"].date()):
        day = list(day)
        r = model.fit(games, teams, prior, as_of=day[0]["date"].replace(hour=0, minute=0), **fit_params)
        for g in day:
            hp, ap, _ = r.predict(g["home"], g["away"], g["neutral"])
            out.append((g, hp - ap))
    return out


def with_probs(margins, scale):
    return [(g, m, 1 / (1 + math.exp(-m / scale))) for g, m in margins]


def best_scale(margins):
    def ll(s):
        return log_loss(with_probs(margins, s))
    return min((s / 10 for s in range(40, 160)), key=ll)


# ---------- metrics ----------
def log_loss(preds):
    tot = 0
    for g, _, p in preds:
        p = min(max(p, 1e-6), 1 - 1e-6)
        tot -= math.log(p if g["hs"] > g["as"] else 1 - p)
    return tot / len(preds)


def metrics(preds):
    n = len(preds)
    correct = sum((m > 0) == (g["hs"] > g["as"]) for g, m, _ in preds)
    brier = sum((p - (g["hs"] > g["as"])) ** 2 for g, _, p in preds) / n
    mae = sum(abs(m - (g["hs"] - g["as"])) for g, m, _ in preds) / n
    return {"games": n, "accuracy": correct / n, "log_loss": log_loss(preds), "brier": brier, "margin_error": mae}


def fmt(m):
    return (f"{m['games']:4d} games  winner right {m['accuracy']:6.1%}  log loss {m['log_loss']:.3f}  "
            f"Brier {m['brier']:.3f}  margin error {m['margin_error']:4.1f} pts")


def early(preds, k=80):
    return preds[:k]  # first ~8 rounds


def report(seasons):
    for s in seasons:
        old = old_model_predictions(SEASONS[s])
        new = with_probs(new_model_margins(s), model.LOGISTIC_SCALE)
        print(f"\n{s}  (season {int(s[1:])}-{int(s[3:]) + 1})")
        print("  old model, all games  ", fmt(metrics(old)))
        print("  new model, all games  ", fmt(metrics(new)))
        print("  old model, first 80   ", fmt(metrics(early(old))))
        print("  new model, first 80   ", fmt(metrics(early(new))))
    old_all = [p for s in seasons for p in old_model_predictions(SEASONS[s])]
    new_all = [p for s in seasons for p in with_probs(new_model_margins(s), model.LOGISTIC_SCALE)]
    print("\nALL SEASONS")
    print("  old model ", fmt(metrics(old_all)))
    print("  new model ", fmt(metrics(new_all)))
    print("  always pick home team: winner right "
          f"{sum(g['hs'] > g['as'] for g, _, _ in new_all) / len(new_all):.1%}")


def tune():
    grid = {
        "prior_strength": [8, 14, 22, 35],
        "carryover": [0.4, 0.55, 0.7, 0.85, 1.0],
        "talent_weight": [0, 1.0, 2.0, 3.0, 4.5],
        "half_life": [120, 240, 0],
        "hca": [2.4, 2.8, 3.2],
    }
    results = []
    for values in itertools.product(*grid.values()):
        params = dict(zip(grid.keys(), values))
        margins = [x for s in TUNE_SEASONS for x in new_model_margins(s, **params)]
        scale = best_scale(margins)
        results.append((log_loss(with_probs(margins, scale)), scale, params))
        print(f"  {results[-1][0]:.4f}  scale {scale:4.1f}  {params}", flush=True)
    results.sort(key=lambda r: r[0])
    print("\nBest 5 on", TUNE_SEASONS)
    for r in results[:5]:
        print(f"  {r[0]:.4f}  scale {r[1]:4.1f}  {r[2]}")
    ll, scale, params = results[0]
    check = with_probs([x for s in CHECK_SEASONS for x in new_model_margins(s, **params)], scale)
    print("\nBest parameters on unseen season", CHECK_SEASONS, ":", fmt(metrics(check)))


if __name__ == "__main__":
    tune() if "--tune" in sys.argv else report(TEST_SEASONS)
