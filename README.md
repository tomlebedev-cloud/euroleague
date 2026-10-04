# Euroleague Hub

A simple Euroleague basketball website: teams, players, statistics, schedule and predictions.
Plain HTML, CSS and JavaScript — no installation and no build step.

## Pages

| Page | What it shows |
|------|---------------|
| **Home** | Latest results, next games (with predicted scores), top of the table, stat leaders |
| **Standings** | Full table: games, wins, losses, points for/against, +/-, last 5 games |
| **Stats** | Every player's per-game stats. Filter by team, click a column to sort |
| **Teams** | All teams. Click one to see its players and all of its games |
| **Schedule** | Go round by round through results and upcoming games, filter by team |
| **Game** | Click any game: score (or prediction), both teams' players, earlier meetings |
| **Predictions** | Win probability and predicted score for every upcoming game, plus a "pick any two teams" tool |

## Run it

Open `index.html` in your browser (double-click it). That's it.

## Updating the data

Everything comes from **`js/data.js`**:

- **Teams and players** — `TEAMS`. Each player row is
  `[name, position, nationality, games, minutes, points, rebounds, assists, steals, blocks, PIR]`.
- **Games** — `GAMES`. When a game is played, change `score: null` to `score: [home, away]`.

Standings, leaders and predictions update automatically from that file.

> The included data is **sample data** for demonstration — rosters and numbers are not official.

## How predictions work

For each team the site uses average points scored and allowed per game. For a game:

```
home score = (home points scored + away points allowed) / 2 + 1.5
away score = (away points scored + home points allowed) / 2 - 1.5
```

That gives a 3-point home advantage. The predicted margin is turned into a win probability
with a logistic curve (a 10-point favourite wins about 84% of the time). The model gets more
reliable as more rounds are played. You can change `HOME_ADVANTAGE` at the top of `js/app.js`.

## Project structure

```
index.html      page layout and navigation
css/style.css   styles (light + dark mode)
js/data.js      teams, players, games  ← edit this
js/app.js       pages, standings, stats and prediction logic
```
