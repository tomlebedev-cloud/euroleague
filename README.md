# Euroleague Hub

A simple EuroLeague basketball website with real data: teams, players, statistics, schedule and predictions.
English or Lithuanian (EN / LT switch in the header, remembered by the browser).
Plain HTML, CSS and JavaScript, plus one small Python script that downloads the data.

## Pages

| Page | What it shows |
|------|---------------|
| **Home** | Latest results, next games (with predicted scores), standings, stat leaders |
| **Standings** | Full table: games, wins, losses, points for/against, +/-, last 5 games |
| **Stats** | Players: per-game averages, shooting percentages (2P%, 3P%, FT%), turnovers and +/−. Teams: points per 100 possessions scored and allowed, pace, eFG%, rebounds and more. Click a column to sort |
| **Teams** | All 20 teams. Click one to see coach, team statistics with league rank, roster with season averages, and all 38 games |
| **Schedule** | Go round by round through all 38 rounds, filter by team |
| **Game** | Played: quarter scores and full box score for both teams. Upcoming: prediction, earlier meetings, both rosters |
| **Predictions** | Win probability and predicted score for the next two rounds, plus a "pick any two teams" tool |
| **Betting** | Next round simulated 40,000 times per game; compare with bookmaker odds, find value bets, keep a bet log |
| **Ticket** | Suggested ticket for the next round with the reasons for each pick: value singles, a combo only when every leg has value, and the minimum odds each pick needs |

## Run it

Open `index.html` in your browser (double-click it). If your browser blocks it, serve the folder:

```
python -m http.server 8000
```

and open http://localhost:8000.

## Updating the data

```
python update_data.py
```

This downloads everything from the official EuroLeague API (`api-live.euroleague.net`) and writes
`js/data.js`: clubs, rosters, coaches, all games, and box scores of every played game. Player season
averages are calculated from those box scores. Run it after each round to get new results.

- Finished box scores are cached in `.cache/` so later runs only download new games.
- If the API rate-limits you, the script waits automatically and continues.
- Another season: `python update_data.py E2025` (2025-26).

Requires Python 3 (standard library only, nothing to install).

### Automatic daily update

On GitHub, the workflow in `.github/workflows/update-data.yml` keeps `js/data.js` current and the website
(GitHub Pages) redeploys by itself after every change:

- **After games:** every half hour in the evening and hourly through the night (UTC) it runs
  `update_data.py --if-new`, which asks the API once whether a game has finished since the last update and
  only then does the full update.
- **Every morning** (05:23 UTC) it runs a full update, which also picks up roster and schedule changes.

GitHub starts scheduled jobs late when it is busy (sometimes by hours), so results can take a while to
appear. To update right away: **Actions → Update EuroLeague data → Run workflow**.

Live site: https://tomlebedev-cloud.github.io/euroleague/

Note: GitHub pauses scheduled workflows in repositories with no activity for 60 days (e.g. in the
summer off-season). If that happens, re-enable it from the Actions tab.

## How predictions work

The model lives in `model.py` and runs inside `update_data.py`; the website only reads its output.

- **Attack and defence ratings.** Each team gets an attack rating (points scored vs. an average team) and a
  defence rating (points allowed), estimated from all games with a weighted ridge regression, so they are
  **adjusted for opponent strength**. Recent games count more (a game 240 days old counts half).
- **Preseason starting point.** Ratings begin at 85% of last season's level, adjusted for **summer
  transfers**: the last-season EuroLeague PIR of players who arrived minus players who left
  (2 points per 1000 PIR). This starting point is worth about 30 games of evidence, so early-season
  predictions lean on it and this season's results gradually take over.
- **Game prediction.** Predicted score = league average + attack + opponent's defence, with +3 points for
  the home team (none at the Final Four). The margin becomes a win chance with a logistic curve.

### Accuracy (backtested)

`backtest.py` replays past seasons game by game, predicting each game using only earlier games:

| 2023-24 → 2025-26 (1,063 games) | Winner right | Log loss | Brier | Margin error |
|---|---|---|---|---|
| Always pick the home team | 63.4% | | | |
| Old model (season points per game) | 65.4% | 0.627 | 0.219 | 9.3 pts |
| **Current model** | **66.8%** | **0.605** | **0.210** | **9.0 pts** |

Lower log loss / Brier means better win probabilities. The biggest gain is early in the season
(first 80 games of 2025-26: 55% → 61% winners right). Rating settings were tuned on 2023-24 and 2024-25 and
checked on 2025-26; the probability scale was fitted on all three seasons, since one season alone gave an
unstable value. Run `python backtest.py` to reproduce, `python backtest.py --tune` to search settings.

The site also shows the model's live track record for the current season, and on every finished game
what it predicted before tip-off.

### Betting page

For each game of the next round the page simulates 40,000 final scores: margin and total are drawn
around the model's prediction with the spread measured on past seasons (`python backtest.py --spread`,
stored in `model.SIM`: margin ±11.5, total ±17 points). Ties go to overtime. From the simulations it
shows fair odds, a fair handicap and total, and model chances at nearby lines.

Type in a bookmaker's decimal odds (winner, handicap, total). The page removes the bookmaker margin,
blends the model's chance with the bookmaker's ("model weight", default 50%, because the bookmaker knows
about injuries and news), and shows the expected value and a stake (¼ Kelly, at most 2% of the bankroll).
Odds, settings and the bet log are saved in your browser only; bet results settle automatically after the
data update.

**Published odds.** `js/odds.js` holds bookmaker odds for the next round, typed in by hand from the
bookmaker's site; they fill in every game you haven't entered your own odds for, and count in the odds history.
Update it before each round.

**Odds template.** "Copy template" gives a plain-text form with every game of the round
(`Win: home away`, `Hcp: line home away`, `Tot: line over under`); fill in the bookmaker's odds and paste it
back with "Apply" (or paste it into a chat).

**Odds history.** Every set of odds you type is saved with the model's chances at that moment (edits within
30 minutes replace the last save, later ones are added, so line moves are kept). Odds lock at tip-off. For
finished games the page compares the model's and the bookmaker's log loss per market, and the result of
1 € on every value bet. Everything stays in the browser; **Export / Import** moves it to another device
or keeps a backup.

**Line-ups.** Each team's three most productive regulars (PIR per game, early in the season leaning on
last season) are its key players. Every key player who doesn't play costs his team 1.5 points of margin.
Players who left the club are counted out; everyone else you tick yourself from the injury news. Players
who missed the team's latest game only get a "missed last game" hint: assuming they stay out made the
predictions worse on past seasons (log loss 0.6051 → 0.6064), because players often return. Measured with `python backtest.py --absences` on 2023-24 to 2025-26 box scores (downloaded once
into `.cache/history/`), each season predicted with the effect measured on the other two: the effect was 1.3–1.8
points in every season, but the overall gain is small (winners right 66.6% → 66.8%), and that is with the
real line-ups known. Summing every missing player's PIR worked worse than counting key players.

**Pace.** Predicted totals add 1.3 points per possession that the two teams play above the league
average this season (possessions from team box scores, shrunk toward the league with 5 games' weight).
`python backtest.py --pace`: total-points error 12.69 → 12.66, 12.99 → 12.79 and 14.09 → 13.99 on 2023-24,
2024-25 and 2025-26. Winner and margin predictions don't change. Taking shooting luck (3-point and free-throw
percentages) out of the ratings was also tested (`--luck`) and made predictions worse, so it is off.

The model has a real edge over a coin flip on winners and margins, but totals are weak (mean error 13.3
points vs 13.9 for the plain league average), and no test against real bookmaker odds has been done. Treat
"value" as a signal to look closer, not a sure thing.

### Ideas tested that did not help

Checked the same way on 2023-24 to 2025-26 (log loss 0.6051 for the current model) and left out:

| Idea | Result |
|---|---|
| Capping blowout margins when fitting ratings | no change (0.6049–0.6051) |
| Rest days / short rest between EuroLeague games | no consistent effect; the sign differs by season |
| A separate home advantage for every team | 0.6046 at best: too small to be real |
| Valuing arrivals by their EuroCup PIR | worse (0.6065 and up) |
| Valuing arrivals by their EuroLeague PIR two seasons ago | no change |
| A fixed value for newcomers from other leagues | 0.6047, and worse early in the season |
| Removing three-point / free-throw luck (`--luck`) | no gain on the unseen season |

Win chances are already well calibrated: favourites given 70–80% won 73%, those given 80–90% won 86%.

Standings follow the official EuroLeague order (downloaded with the data), which applies the league's
tie-breakers such as head-to-head results. If the official table is behind the results shown, the site
falls back to wins, then point difference. Only regular-season games count.

## Project structure

```
index.html       page layout and navigation
css/style.css    styles (light + dark mode)
js/app.js        pages, standings and stats
js/betting.js    betting page: simulation, odds comparison, bet log
js/ticket.js     ticket page: suggested bets and the reasons for them
js/odds.js       bookmaker odds for the next round (edit by hand)
js/data.js       generated data — don't edit by hand
update_data.py   downloads data from the EuroLeague API
model.py         prediction model
backtest.py      measures prediction accuracy on past seasons
```

Not affiliated with EuroLeague Basketball. Data and team logos belong to their owners.
