# Euroleague Hub

A simple EuroLeague basketball website with real data: teams, players, statistics, schedule and predictions.
Plain HTML, CSS and JavaScript, plus one small Python script that downloads the data.

## Pages

| Page | What it shows |
|------|---------------|
| **Home** | Latest results, next games (with predicted scores), standings, stat leaders |
| **Standings** | Full table: games, wins, losses, points for/against, +/-, last 5 games |
| **Stats** | Every player's per-game averages. Filter by team, click a column to sort |
| **Teams** | All 20 teams. Click one to see coach, roster with season averages, and all 38 games |
| **Schedule** | Go round by round through all 38 rounds, filter by team |
| **Game** | Played: quarter scores and full box score for both teams. Upcoming: prediction, earlier meetings, both rosters |
| **Predictions** | Win probability and predicted score for the next two rounds, plus a "pick any two teams" tool |

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

On GitHub, the workflow in `.github/workflows/update-data.yml` runs `update_data.py` every day at
05:00 UTC and commits the new `js/data.js` when results changed. The website (GitHub Pages) then
redeploys by itself. To update right away: **Actions → Update EuroLeague data → Run workflow**.

Live site: https://tomlebedev-cloud.github.io/euroleague/

Note: GitHub pauses scheduled workflows in repositories with no activity for 60 days (e.g. in the
summer off-season). If that happens, re-enable it from the Actions tab.

## How predictions work

For each team the site uses average points scored and allowed per game. Early in the season those
averages are pulled toward the league average (as if every team had also played 2 average games), so
one big win doesn't skew everything. For a game:

```
home score = (home points scored + away points allowed) / 2 + 1.5
away score = (away points scored + home points allowed) / 2 - 1.5
```

That gives a 3-point home advantage. The predicted margin is turned into a win probability with a
logistic curve (a 10-point favourite wins about 84% of the time). Settings are at the top of `js/app.js`.

Standings are sorted by wins, then point difference. The official EuroLeague tie-breaker (head-to-head)
can differ when teams are level.

## Project structure

```
index.html       page layout and navigation
css/style.css    styles (light + dark mode)
js/app.js        pages, standings, stats and prediction logic
js/data.js       generated data — don't edit by hand
update_data.py   downloads data from the EuroLeague API
```

Not affiliated with EuroLeague Basketball. Data and team logos belong to their owners.
