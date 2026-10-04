// =====================================================================
//  Euroleague Hub — simple single-page app (no build step, no libraries)
//  Pages are selected by the URL hash: #home, #standings, #stats,
//  #teams, #team/RMB, #schedule, #game/12, #predictions
// =====================================================================

const HOME_ADVANTAGE = 3; // points added to the home team in predictions

// ---------- Prepare data ----------
const PLAYER_FIELDS = ["name", "pos", "nat", "gp", "min", "pts", "reb", "ast", "stl", "blk", "pir"];

const teamById = {};
const players = [];
TEAMS.forEach(team => {
  team.roster = team.players.map(row => {
    const p = Object.fromEntries(PLAYER_FIELDS.map((f, i) => [f, row[i]]));
    p.team = team.id;
    players.push(p);
    return p;
  });
  teamById[team.id] = team;
});
GAMES.forEach((g, i) => { g.id = i; });

const played = GAMES.filter(g => g.score);
const upcoming = GAMES.filter(g => !g.score);

// ---------- Helpers ----------
const $app = document.getElementById("app");
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtDate = d => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const signed = n => (n > 0 ? "+" : "") + n;
const num = (n, key) => key === "gp" ? n : n.toFixed(1);

function badge(team, size = "") {
  return `<span class="badge ${size}" style="background:${team.color}">${team.id}</span>`;
}
function teamLink(id, size = "sm") {
  const t = teamById[id];
  return `<a class="team-cell" href="#team/${t.id}">${badge(t, size)}<span>${esc(t.name)}</span></a>`;
}

// ---------- Standings ----------
function computeStandings() {
  const rows = {};
  TEAMS.forEach(t => rows[t.id] = { id: t.id, gp: 0, w: 0, l: 0, pf: 0, pa: 0, form: [] });

  played.forEach(g => {
    const [hs, as] = g.score;
    const h = rows[g.home], a = rows[g.away];
    h.gp++; a.gp++;
    h.pf += hs; h.pa += as;
    a.pf += as; a.pa += hs;
    if (hs > as) { h.w++; a.l++; h.form.push("W"); a.form.push("L"); }
    else { a.w++; h.l++; a.form.push("W"); h.form.push("L"); }
  });

  return Object.values(rows)
    .map(r => ({ ...r, diff: r.pf - r.pa, form: r.form.slice(-5) }))
    .sort((a, b) => b.w - a.w || b.diff - a.diff || b.pf - a.pf);
}

function standingsTable(rows, compact = false) {
  return `
    <div class="table-wrap"><table>
      <thead><tr>
        <th>#</th><th class="left">Team</th><th>GP</th><th>W</th><th>L</th>
        ${compact ? "" : "<th>PF</th><th>PA</th>"}<th>+/-</th>${compact ? "" : "<th>Form</th>"}
      </tr></thead>
      <tbody>
        ${rows.map((r, i) => `
          <tr class="${i < 6 ? "playoff" : i < 10 ? "playin" : ""}">
            <td class="pos">${i + 1}</td>
            <td class="left">${teamLink(r.id)}</td>
            <td>${r.gp}</td><td>${r.w}</td><td>${r.l}</td>
            ${compact ? "" : `<td>${r.pf}</td><td>${r.pa}</td>`}
            <td class="${r.diff > 0 ? "plus" : r.diff < 0 ? "minus" : ""}">${signed(r.diff)}</td>
            ${compact ? "" : `<td><span class="form">${r.form.map(f => `<b class="${f}">${f}</b>`).join("")}</span></td>`}
          </tr>`).join("")}
      </tbody>
    </table></div>
    <div class="legend"><span class="l-po">Playoffs (1–6)</span><span class="l-pi">Play-In (7–10)</span></div>`;
}

// ---------- Predictions ----------
// Simple model: each team's points scored / allowed per game so far,
// blended against the opponent, plus home-court advantage.
function teamRatings() {
  const ratings = {};
  const leagueAvg = played.length
    ? played.reduce((s, g) => s + g.score[0] + g.score[1], 0) / (played.length * 2)
    : 80;
  computeStandings().forEach(r => {
    ratings[r.id] = r.gp
      ? { off: r.pf / r.gp, def: r.pa / r.gp }
      : { off: leagueAvg, def: leagueAvg };
  });
  return ratings;
}

function predict(homeId, awayId) {
  const R = teamRatings();
  const h = R[homeId], a = R[awayId];
  const homePts = (h.off + a.def) / 2 + HOME_ADVANTAGE / 2;
  const awayPts = (a.off + h.def) / 2 - HOME_ADVANTAGE / 2;
  const margin = homePts - awayPts;
  const homeWin = 1 / (1 + Math.exp(-margin / 6)); // ~10 pt favourite ≈ 84%
  let hp = Math.round(homePts), ap = Math.round(awayPts);
  if (hp === ap) margin >= 0 ? hp++ : ap++; // basketball has no draws
  return { homePts: hp, awayPts: ap, homeWin };
}

function probBar(homeId, awayId, p) {
  const h = teamById[homeId], a = teamById[awayId];
  const hp = Math.round(p * 100), ap = 100 - hp;
  return `<div class="prob-bar">
    <div style="width:${hp}%;background:${h.color}">${h.id} ${hp}%</div>
    <div style="width:${ap}%;background:${a.color}">${ap}% ${a.id}</div>
  </div>`;
}

// ---------- Game rows ----------
function gameRow(g, showPrediction = false) {
  let middle, homeCls = "", awayCls = "";
  if (g.score) {
    const [hs, as] = g.score;
    homeCls = hs > as ? "winner" : "loser";
    awayCls = as > hs ? "winner" : "loser";
    middle = `${hs} – ${as}<small>Final · ${fmtDate(g.date)}</small>`;
  } else if (showPrediction) {
    const p = predict(g.home, g.away);
    middle = `<span class="muted">${p.homePts} – ${p.awayPts}</span><small>Prediction · ${fmtDate(g.date)}</small>`;
  } else {
    middle = `vs<small>${fmtDate(g.date)}</small>`;
  }
  const h = teamById[g.home], a = teamById[g.away];
  return `<a class="game" href="#game/${g.id}">
    <span class="side ${homeCls}">${badge(h, "sm")}${esc(h.name)}</span>
    <span class="score">${middle}</span>
    <span class="side away ${awayCls}">${esc(a.name)}${badge(a, "sm")}</span>
  </a>`;
}

const latestRound = () => played.length ? Math.max(...played.map(g => g.round)) : 0;
const nextRound = () => upcoming.length ? Math.min(...upcoming.map(g => g.round)) : null;

// ---------- Pages ----------
const pages = {
  home() {
    const lr = latestRound(), nr = nextRound();
    const top = computeStandings().slice(0, 8);
    return `
      <h1>Euroleague ${SEASON}</h1>
      <div class="grid-2">
        <div>
          <div class="card">
            <h2>Latest results — Round ${lr}</h2>
            ${played.filter(g => g.round === lr).map(g => gameRow(g)).join("") || "<p class='muted'>No games yet.</p>"}
          </div>
          <div class="card">
            <h2>Next games${nr ? ` — Round ${nr}` : ""}</h2>
            ${nr ? upcoming.filter(g => g.round === nr).map(g => gameRow(g, true)).join("") : "<p class='muted'>Season finished.</p>"}
            <p class="note">Grey scores are predictions. <a href="#predictions">See all predictions →</a></p>
          </div>
        </div>
        <div>
          <div class="card">
            <h2>Top of the table</h2>
            ${standingsTable(top, true)}
            <p class="note"><a href="#standings">Full standings →</a></p>
          </div>
          <div class="card">
            <h2>Leaders</h2>
            ${leaderList("pts", "Points")}${leaderList("reb", "Rebounds")}${leaderList("ast", "Assists")}${leaderList("pir", "PIR")}
            <p class="note"><a href="#stats">All player stats →</a></p>
          </div>
        </div>
      </div>`;
  },

  standings() {
    return `<h1>Standings</h1><div class="card">${standingsTable(computeStandings())}</div>`;
  },

  stats(params) {
    return `<h1>Player statistics</h1>
      <div class="controls">
        <label>Team
          <select id="teamFilter">
            <option value="">All teams</option>
            ${TEAMS.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}
          </select>
        </label>
        <span class="note">Click a column header to sort. All values are per game.</span>
      </div>
      <div class="card" id="statsTable"></div>`;
  },

  teams() {
    return `<h1>Teams</h1>
      <div class="grid-teams">
        ${[...TEAMS].sort((a, b) => a.name.localeCompare(b.name)).map(t => `
          <a class="team-card" href="#team/${t.id}">${badge(t)}
            <span><b>${esc(t.name)}</b><small>${esc(t.city)}, ${esc(t.country)}</small></span>
          </a>`).join("")}
      </div>`;
  },

  team([id]) {
    const t = teamById[id];
    if (!t) return notFound();
    const st = computeStandings();
    const pos = st.findIndex(r => r.id === id);
    const r = st[pos];
    const games = GAMES.filter(g => g.home === id || g.away === id);
    return `
      <p><a href="#teams">← All teams</a></p>
      <h1 style="display:flex;align-items:center;gap:12px">${badge(t)} ${esc(t.name)}</h1>
      <p class="muted">${esc(t.city)}, ${esc(t.country)} · Position ${pos + 1} · ${r.w}–${r.l} · ${signed(r.diff)} point difference</p>
      <div class="card">
        <h2>Players</h2>
        ${playerTable(t.roster, false)}
      </div>
      <div class="card">
        <h2>Games</h2>
        ${games.map(g => gameRow(g, true)).join("")}
      </div>`;
  },

  schedule() {
    const rounds = [...new Set(GAMES.map(g => g.round))].sort((a, b) => a - b);
    return `<h1>Schedule & results</h1>
      <div class="controls">
        <button id="prevRound">← Previous</button>
        <select id="roundSelect">${rounds.map(r => `<option value="${r}">Round ${r}</option>`).join("")}</select>
        <button id="nextRound">Next →</button>
        <label>Team
          <select id="schedTeam"><option value="">All teams</option>
            ${TEAMS.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="card" id="roundGames"></div>`;
  },

  game([id]) {
    const g = GAMES[Number(id)];
    if (!g) return notFound();
    const h = teamById[g.home], a = teamById[g.away];
    const p = predict(g.home, g.away);
    const middle = g.score
      ? `<div class="big">${g.score[0]} – ${g.score[1]}</div><div class="muted">Final</div>`
      : `<div class="big muted">vs</div><div class="muted">Upcoming</div>`;
    const headToHead = played.filter(x =>
      (x.home === g.home && x.away === g.away) || (x.home === g.away && x.away === g.home));
    return `
      <p><a href="#schedule">← Schedule</a></p>
      <div class="card">
        <p class="muted" style="text-align:center;margin-top:0">Round ${g.round} · ${fmtDate(g.date)} · ${esc(h.city)}</p>
        <div class="scoreboard">
          <div><a href="#team/${h.id}">${badge(h)}</a><div><b>${esc(h.name)}</b></div><div class="muted">Home</div></div>
          <div>${middle}</div>
          <div><a href="#team/${a.id}">${badge(a)}</a><div><b>${esc(a.name)}</b></div><div class="muted">Away</div></div>
        </div>
      </div>
      ${g.score ? "" : `
      <div class="card">
        <h2>Prediction</h2>
        ${probBar(g.home, g.away, p.homeWin)}
        <p>Predicted score: <b>${esc(h.name)} ${p.homePts} – ${p.awayPts} ${esc(a.name)}</b></p>
        <p class="note">Based on points scored and allowed so far this season, plus ${HOME_ADVANTAGE} points home advantage.</p>
      </div>`}
      ${headToHead.length && !g.score ? `<div class="card"><h2>Earlier meetings</h2>${headToHead.map(x => gameRow(x)).join("")}</div>` : ""}
      <div class="grid-2">
        <div class="card"><h2>${esc(h.name)}</h2>${playerTable(h.roster, false, true)}</div>
        <div class="card"><h2>${esc(a.name)}</h2>${playerTable(a.roster, false, true)}</div>
      </div>`;
  },

  predictions() {
    const nr = nextRound();
    const rounds = [...new Set(upcoming.map(g => g.round))].sort((a, b) => a - b);
    return `<h1>Predictions</h1>
      <div class="card">
        <h2>Pick any match-up</h2>
        <div class="controls">
          <label>Home <select id="pHome">${TEAMS.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></label>
          <label>Away <select id="pAway">${TEAMS.map((t, i) => `<option value="${t.id}" ${i === 1 ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
        </div>
        <div id="customPrediction"></div>
      </div>
      ${rounds.map(r => `
        <div class="card">
          <h2>Round ${r}${r === nr ? " — next up" : ""}</h2>
          ${upcoming.filter(g => g.round === r).map(g => {
            const p = predict(g.home, g.away);
            const fav = p.homeWin >= 0.5 ? teamById[g.home] : teamById[g.away];
            return `${gameRow(g, true)}${probBar(g.home, g.away, p.homeWin)}
              <p class="note" style="margin-top:0">Pick: <span class="pick">${esc(fav.name)}</span></p>`;
          }).join("")}
        </div>`).join("") || "<div class='card'><p class='muted'>No upcoming games.</p></div>"}
      <p class="note">How it works: each team's average points scored and allowed are combined with the opponent's,
        then the home team gets +${HOME_ADVANTAGE} points. The point margin is turned into a win probability.
        Predictions get better as more games are played.</p>`;
  },
};

function notFound() {
  return `<h1>Not found</h1><p><a href="#home">Back to home</a></p>`;
}

// ---------- Player tables ----------
const STAT_COLS = [
  ["gp", "GP"], ["min", "MIN"], ["pts", "PTS"], ["reb", "REB"], ["ast", "AST"],
  ["stl", "STL"], ["blk", "BLK"], ["pir", "PIR"],
];

function playerTable(list, showTeam, compact = false, sortKey = null) {
  const cols = compact ? STAT_COLS.filter(([k]) => ["pts", "reb", "ast", "pir"].includes(k)) : STAT_COLS;
  return `<div class="table-wrap"><table>
    <thead><tr>
      <th class="left">Player</th>${compact ? "" : "<th>Pos</th>"}${showTeam ? '<th class="left">Team</th>' : ""}
      ${cols.map(([k, label]) => `<th class="${sortKey !== null ? "sortable" : ""} ${k === sortKey ? "sorted" : ""}" data-sort="${k}">${label}</th>`).join("")}
    </tr></thead>
    <tbody>
      ${list.map(p => `<tr>
        <td class="left">${esc(p.name)} <span class="muted">${compact ? p.pos : p.nat}</span></td>
        ${compact ? "" : `<td>${p.pos}</td>`}
        ${showTeam ? `<td class="left">${teamLink(p.team)}</td>` : ""}
        ${cols.map(([k]) => `<td>${num(p[k], k)}</td>`).join("")}
      </tr>`).join("")}
    </tbody>
  </table></div>`;
}

function leaderList(key, label) {
  const top = [...players].sort((a, b) => b[key] - a[key]).slice(0, 3);
  return `<div style="margin-bottom:10px"><div class="round-title">${label}</div>
    ${top.map((p, i) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0">
      <span>${i + 1}. ${esc(p.name)} <span class="muted">${p.team}</span></span><b>${num(p[key])}</b></div>`).join("")}
  </div>`;
}

// ---------- Interactivity per page ----------
const setup = {
  stats() {
    let sortKey = "pts";
    const sel = document.getElementById("teamFilter");
    const box = document.getElementById("statsTable");
    const render = () => {
      const list = players.filter(p => !sel.value || p.team === sel.value).sort((a, b) => b[sortKey] - a[sortKey]);
      box.innerHTML = playerTable(list, true, false, sortKey);
      box.querySelectorAll("th.sortable").forEach(th =>
        th.addEventListener("click", () => { sortKey = th.dataset.sort; render(); }));
    };
    sel.addEventListener("change", render);
    render();
  },

  schedule() {
    const sel = document.getElementById("roundSelect");
    const teamSel = document.getElementById("schedTeam");
    const box = document.getElementById("roundGames");
    const prev = document.getElementById("prevRound");
    const next = document.getElementById("nextRound");
    sel.value = nextRound() ?? latestRound();
    const render = () => {
      const r = Number(sel.value);
      const games = GAMES.filter(g => g.round === r && (!teamSel.value || g.home === teamSel.value || g.away === teamSel.value));
      box.innerHTML = `<h2>Round ${r}</h2>` + (games.map(g => gameRow(g, true)).join("") || "<p class='muted'>No games.</p>");
      prev.disabled = sel.selectedIndex === 0;
      next.disabled = sel.selectedIndex === sel.options.length - 1;
    };
    prev.addEventListener("click", () => { sel.selectedIndex--; render(); });
    next.addEventListener("click", () => { sel.selectedIndex++; render(); });
    sel.addEventListener("change", render);
    teamSel.addEventListener("change", render);
    render();
  },

  predictions() {
    const h = document.getElementById("pHome"), a = document.getElementById("pAway");
    const box = document.getElementById("customPrediction");
    const render = () => {
      if (h.value === a.value) { box.innerHTML = "<p class='muted'>Choose two different teams.</p>"; return; }
      const p = predict(h.value, a.value);
      box.innerHTML = `${probBar(h.value, a.value, p.homeWin)}
        <p>Predicted score: <b>${esc(teamById[h.value].name)} ${p.homePts} – ${p.awayPts} ${esc(teamById[a.value].name)}</b></p>`;
    };
    h.addEventListener("change", render);
    a.addEventListener("change", render);
    render();
  },
};

// ---------- Router ----------
function route() {
  const [page, ...params] = (location.hash.slice(1) || "home").split("/");
  const view = pages[page];
  $app.innerHTML = view ? view(params) : notFound();
  if (setup[page]) setup[page](params);
  const navKey = { team: "teams", game: "schedule" }[page] || page;
  document.querySelectorAll("nav a").forEach(a => a.classList.toggle("active", a.dataset.nav === navKey));
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", route);
route();
