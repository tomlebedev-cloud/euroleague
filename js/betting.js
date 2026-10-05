// =====================================================================
//  Betting page (#bets): Monte Carlo simulation of the next round,
//  compared with bookmaker odds you type in (e.g. TopSport).
//  Loaded after app.js and uses its helpers (esc, teamById, predict, ...).
//  Odds, odds history, settings and your bet log are saved in this browser only
//  (Export / Import moves them to another browser).
// =====================================================================

// Spread of real results around the model's prediction, measured by backtest.py
// (written into MODEL by update_data.py; these defaults are only a fallback).
const SIM = Object.assign({ sdMargin: 11.5, marginBias: 0.6, sdTotal: 17, totalBias: 1.2, corr: 0 }, MODEL.sim || {});
const SIMS = 40000;

// ---------- storage (may be unavailable: private mode, blocked site data) ----------
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not saved, page still works */ }
}

const betSettings = Object.assign(
  { bankroll: 100, kelly: 0.25, maxPct: 2, minEdge: 5, modelWeight: 50 },
  load("bets.settings", {}));
const odds = load("bets.odds", {});   // game code -> { ml: [h, a], hcp: [line, h, a], tot: [line, o, u] }
// odds published with the site (js/odds.js) fill in games you haven't typed odds for
const published = typeof BOOK_ODDS !== "undefined" ? BOOK_ODDS : { games: {} };
for (const [code, o] of Object.entries(published.games)) {
  if (!odds[code]) odds[code] = JSON.parse(JSON.stringify(o));
}
let myBets = load("bets.log", []);    // [{ id, code, market, side, line, odds, stake, placed }]
const lineups = load("bets.out", {});  // game code -> { player code: true (out) / false (plays) }
// every set of odds you typed, with the model's chances at that moment (the model changes after each round):
// game code -> [{ t: time, out: key players out, sels: [{ market, side, line, odds, fair, model, push }] }]
let oddsLog = load("bets.oddsLog", {});

// ---------- line-ups ----------
// AVAILABILITY (from update_data.py): team -> regulars [[code, PIR per game, missed latest game, left club]],
// best first. The top ABS.keyPlayers are key players: each one who doesn't play costs ABS.perPlayer points
// of margin (measured on 2023-24 to 2025-26, see backtest.py --absences).
const ABS = Object.assign({ keyPlayers: 3, perPlayer: 1.5 }, MODEL.absence || {});
const playerName = {};
TEAMS.forEach(t => t.players.forEach(p => { playerName[p.code] = p.name; }));
const regulars = id => (typeof AVAILABILITY !== "undefined" && AVAILABILITY[id]) || [];

function isOut(g, p) {
  if (p[3]) return true; // left the club
  return lineups[g.code]?.[p[0]] ?? p[2]; // your choice, else: out if he missed the latest game
}
const keyOut = (g, team) => regulars(team).slice(0, ABS.keyPlayers).filter(p => isOut(g, p));

// model prediction adjusted for who plays
function gamePrediction(g) {
  const p = predict(g.home, g.away, g.neutral);
  const outHome = keyOut(g, g.home), outAway = keyOut(g, g.away);
  const shift = ABS.perPlayer * (outAway.length - outHome.length); // home margin change; total unchanged
  const margin = p.margin + shift, total = p.total;
  let hp = Math.round((total + margin) / 2), ap = Math.round((total - margin) / 2);
  if (hp === ap) margin >= 0 ? hp++ : ap++;
  return { homePts: hp, awayPts: ap, margin, total, shift, outHome, outAway };
}

// ---------- simulation ----------
function rng(seed) {  // mulberry32: same game -> same numbers on every page load
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function normal(rand) {
  const u = 1 - rand(), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const simCache = {};
// -> { margins: Int16Array, totals: Int16Array } of final scores (overtime included)
function simulate(g) {
  const p = gamePrediction(g);
  const key = `${g.code}|${p.margin.toFixed(3)}|${p.total.toFixed(3)}`;
  if (simCache[key]) return simCache[key];
  const mu = p.margin + SIM.marginBias, tot = p.total + SIM.totalBias;
  // same random numbers for a game, so line-up changes compare cleanly
  const rand = rng(Number(g.code) * 7919 + 17);
  const margins = new Int16Array(SIMS), totals = new Int16Array(SIMS);
  const c = SIM.corr, c2 = Math.sqrt(1 - c * c);
  const ot = Math.sqrt(5 / 40); // an overtime is 5 of 40 minutes
  for (let i = 0; i < SIMS; i++) {
    const z1 = normal(rand), z2 = normal(rand);
    const m = mu + SIM.sdMargin * z1;
    const t = tot + SIM.sdTotal * (c * z1 + c2 * z2);
    let hs = Math.round((t + m) / 2), as = Math.round((t - m) / 2);
    while (hs === as) { // tied after regulation: play overtime
      const om = mu / 8 + SIM.sdMargin * ot * normal(rand);
      const otot = tot / 8 + SIM.sdTotal * ot * normal(rand) / 2;
      hs += Math.round((otot + om) / 2);
      as += Math.round((otot - om) / 2);
    }
    margins[i] = hs - as;
    totals[i] = hs + as;
  }
  return simCache[key] = { margins, totals, pred: p };
}

// probability that a bet wins / is refunded (whole-number lines can push)
function chances(sim, market, side, line) {
  let win = 0, push = 0;
  const { margins, totals } = sim;
  for (let i = 0; i < SIMS; i++) {
    let x;
    if (market === "ml") x = side === "home" ? margins[i] : -margins[i];
    else if (market === "hcp") x = side === "home" ? margins[i] + line : -margins[i] - line;
    else x = side === "over" ? totals[i] - line : line - totals[i];
    if (x > 0) win++; else if (x === 0) push++;
  }
  return { win: win / SIMS, push: push / SIMS };
}

// median (= fair line) of a sorted copy
function median(arr) {
  const s = Float64Array.from(arr).sort();
  return s[s.length >> 1];
}

// ---------- evaluating odds ----------
// every selection that has odds typed in for game g
function selections(g) {
  const o = odds[g.code] || {}, h = teamById[g.home], a = teamById[g.away];
  const out = [];
  const pair = (market, line, sides) => {
    const [s1, s2] = sides;
    if (!(s1.odds > 1 && s2.odds > 1)) { // only one side typed: no fair-price comparison
      sides.forEach(s => s.odds > 1 && out.push({ market, line, ...s, fair: null }));
      return;
    }
    const i1 = 1 / s1.odds, i2 = 1 / s2.odds; // remove the bookmaker margin proportionally
    out.push({ market, line, ...s1, fair: i1 / (i1 + i2), vig: i1 + i2 - 1 });
    out.push({ market, line, ...s2, fair: i2 / (i1 + i2), vig: i1 + i2 - 1 });
  };
  if (o.ml) pair("ml", 0, [
    { side: "home", label: `${h.name} to win`, odds: o.ml[0] },
    { side: "away", label: `${a.name} to win`, odds: o.ml[1] }]);
  if (o.hcp && isFinite(o.hcp[0])) pair("hcp", o.hcp[0], [
    { side: "home", label: `${h.name} ${signed(o.hcp[0])}`, odds: o.hcp[1] },
    { side: "away", label: `${a.name} ${signed(-o.hcp[0])}`, odds: o.hcp[2] }]);
  if (o.tot && o.tot[0] > 0) pair("tot", o.tot[0], [
    { side: "over", label: `Over ${o.tot[0]}`, odds: o.tot[1] },
    { side: "under", label: `Under ${o.tot[0]}`, odds: o.tot[2] }]);

  const sim = simulate(g);
  return out.map(s => {
    const c = chances(sim, s.market, s.side, s.line);
    return price({ ...s, game: g, model: c.win, push: c.push });
  });
}

// adds pWin (chance used), ev and stake to a selection with odds, fair (bookmaker) and model chances
function price(s) {
  const w = betSettings.modelWeight / 100;
  // the bookmaker follows the news more closely than the model: blend toward its price
  const winNoPush = s.model / (1 - s.push || 1);
  const blended = s.fair == null ? winNoPush : w * winNoPush + (1 - w) * s.fair;
  const pWin = blended * (1 - s.push);
  const ev = pWin * s.odds + s.push - 1;
  return { ...s, pWin, ev, stake: stake(pWin, s.push, s.odds) };
}

// fractional Kelly, capped; 0 when there's no edge
function stake(pWin, pPush, o) {
  const pLose = 1 - pWin - pPush, b = o - 1;
  const f = (b * pWin - pLose) / b;
  if (f <= 0) return 0;
  const pct = Math.min(f * betSettings.kelly, betSettings.maxPct / 100);
  return Math.floor(pct * betSettings.bankroll * 2) / 2; // round down to 0.50
}

const pct = p => (100 * p).toFixed(1) + "%";
const evText = ev => `<span class="${ev > 0 ? "plus" : "minus"}">${ev > 0 ? "+" : ""}${(100 * ev).toFixed(1)}%</span>`;
const isValue = s => s.ev * 100 >= betSettings.minEdge && s.stake > 0;

// ---------- my bets ----------
// 1 = won, 0 = refunded (push), -1 = lost, null = not played yet
function outcome(b) {
  const g = gameByCode[b.code];
  if (!g || !g.score) return null;
  const m = g.score[0] - g.score[1], t = g.score[0] + g.score[1];
  let x;
  if (b.market === "ml") x = b.side === "home" ? m : -m;
  else if (b.market === "hcp") x = b.side === "home" ? m + b.line : -m - b.line;
  else x = b.side === "over" ? t - b.line : b.line - t;
  return Math.sign(x);
}
function settle(b) {
  const r = outcome(b);
  return r === null ? null : r > 0 ? b.stake * (b.odds - 1) : r === 0 ? 0 : -b.stake;
}

// ---------- odds template ----------
// A plain-text form for all games of the round: fill in the bookmaker's odds and paste it back
// (on this page, or into a chat). Lines: "#code Home – Away", "Win: home away",
// "Hcp: home-line home away", "Tot: line over under". Missing numbers are simply skipped.
function oddsTemplate(games) {
  const v = x => x ?? "";
  return `EuroLeague round ${games[0]?.round ?? ""} odds. Decimal odds; handicap line for the HOME team (e.g. -4.5).\n\n`
    + games.map(g => {
      const o = odds[g.code] || {}, h = teamById[g.home], a = teamById[g.away];
      return `#${g.code} ${h.name} – ${a.name} (${fmtDate(g.date)} ${fmtTime(g.date)})
Win: ${v(o.ml?.[0])} ${v(o.ml?.[1])}
Hcp: ${v(o.hcp?.[0])} ${v(o.hcp?.[1])} ${v(o.hcp?.[2])}
Tot: ${v(o.tot?.[0])} ${v(o.tot?.[1])} ${v(o.tot?.[2])}`;
    }).join("\n\n");
}

// -> number of games updated
function applyTemplate(text) {
  let code = null, n = 0;
  const changed = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const head = line.match(/^#(\d+)/);
    if (head) { code = gameByCode[head[1]] && !started(gameByCode[head[1]]) ? head[1] : null; continue; }
    const m = line.match(/^(win|hcp|tot)\s*:\s*(.*)$/i);
    if (!code || !m) continue;
    const nums = (m[2].match(/[-+]?\d+(?:[.,]\d+)?/g) || []).map(x => Number(x.replace(",", ".")));
    const key = { win: "ml", hcp: "hcp", tot: "tot" }[m[1].toLowerCase()];
    const size = key === "ml" ? 2 : 3;
    if (nums.length < size) continue;
    odds[code] = odds[code] || {};
    odds[code][key] = nums.slice(0, size);
    changed.add(code);
  }
  save("bets.odds", odds);
  changed.forEach(c => { recordOdds(gameByCode[c]); n++; });
  return n;
}

// ---------- odds history ----------
const tipOff = g => Date.parse(g.utc ? (/[Z+]/.test(g.utc.slice(10)) ? g.utc : g.utc + "Z") : g.date);
const started = g => Date.now() >= tipOff(g);

// save the odds typed for game g, with the model's chances now; edits within 30 minutes replace the last save
function recordOdds(g) {
  const sels = selections(g).filter(s => s.fair != null); // complete pairs only
  const list = oddsLog[g.code] = oddsLog[g.code] || [];
  const last = list[list.length - 1];
  const recent = last && Date.now() - Date.parse(last.t) < 30 * 60 * 1000;
  if (!sels.length) { // all odds cleared
    if (recent) list.pop();
    if (!list.length) delete oddsLog[g.code];
  } else {
    const p = gamePrediction(g);
    const entry = {
      t: new Date().toISOString(),
      out: [...p.outHome, ...p.outAway].map(x => x[0]),
      sels: sels.map(x => ({ market: x.market, side: x.side, line: x.line, odds: x.odds,
        fair: +x.fair.toFixed(4), model: +x.model.toFixed(4), push: +x.push.toFixed(4) })),
    };
    if (recent) list[list.length - 1] = entry; else list.push(entry);
  }
  save("bets.oddsLog", oddsLog);
}

// published odds count in the history too (once per game, before tip-off)
function recordPublished() {
  for (const code of Object.keys(published.games)) {
    const g = gameByCode[code];
    if (g && !g.score && !started(g) && !oddsLog[code]) recordOdds(g);
  }
}

// the last odds saved before tip-off, for each finished game
function closingOdds() {
  return Object.entries(oddsLog).map(([code, list]) => {
    const g = gameByCode[code];
    if (!g || !g.score) return null;
    const before = list.filter(e => Date.parse(e.t) < tipOff(g));
    return before.length ? { g, e: before[before.length - 1] } : null;
  }).filter(Boolean).sort((a, b) => tipOff(a.g) - tipOff(b.g));
}

function historyCard() {
  const games = closingOdds();
  const pending = Object.keys(oddsLog).filter(c => !gameByCode[c]?.score).length;
  if (!games.length) {
    return `<div class="card"><h2>Model vs bookmaker</h2>
      <p class="muted">Odds you type in are saved automatically with the model's chances at that moment.
        Once games are played, this shows whether the model or the bookmaker priced them better.
        ${pending ? `Saved so far: ${pending} game${pending > 1 ? "s" : ""} waiting for results.` : ""}</p></div>`;
  }
  // accuracy: log loss of both on the side that the odds were on (home / over), pushes left out
  const acc = { ml: [0, 0, 0], hcp: [0, 0, 0], tot: [0, 0, 0] }; // [games, model loss, bookmaker loss]
  const flat = { n: 0, won: 0, profit: 0 }; // 1 unit on every value bet
  const rows = [];
  for (const { g, e } of games) {
    for (const s of e.sels) {
      const r = outcome({ code: g.code, ...s });
      if (s.side === "home" || s.side === "over") {
        if (r !== 0) {
          const hit = r > 0, a = acc[s.market];
          const pm = Math.min(Math.max(s.model / (1 - s.push || 1), 1e-4), 1 - 1e-4);
          a[0]++;
          a[1] -= Math.log(hit ? pm : 1 - pm);
          a[2] -= Math.log(hit ? s.fair : 1 - s.fair);
        }
      }
      const priced = price(s);
      if (isValue(priced)) {
        flat.n++;
        flat.won += r > 0;
        flat.profit += r > 0 ? s.odds - 1 : r < 0 ? -1 : 0;
        rows.push({ g, s, priced, r });
      }
    }
  }
  const names = { ml: "Winner", hcp: "Handicap", tot: "Total" };
  const accRows = Object.entries(acc).filter(([, a]) => a[0]).map(([k, a]) => {
    const m = a[1] / a[0], b = a[2] / a[0];
    return `<tr><td class="left">${names[k]}</td><td>${a[0]}</td><td>${m.toFixed(3)}</td><td>${b.toFixed(3)}</td>
      <td class="${m < b ? "plus" : "minus"}">${m < b ? "model" : "bookmaker"}</td></tr>`;
  }).join("");
  const fmtOut = r => r > 0 ? `<span class="plus">won</span>` : r < 0 ? `<span class="minus">lost</span>` : "push";
  return `<div class="card">
    <h2>Model vs bookmaker</h2>
    <p class="note" style="margin-top:0">${games.length} finished game${games.length > 1 ? "s" : ""} with odds saved before
      tip-off${pending ? ` · ${pending} waiting for results` : ""}. Lower log loss = better chances.</p>
    <div class="table-wrap"><table>
      <thead><tr><th class="left">Market</th><th>Games</th><th>Model</th><th>Bookmaker</th><th>Better</th></tr></thead>
      <tbody>${accRows || "<tr><td colspan='5' class='muted left'>No complete odds yet.</td></tr>"}</tbody>
    </table></div>
    <p class="record">Every value bet at 1 € (current settings): <b>${flat.n}</b> bets, ${flat.won} won, profit
      <b class="${flat.profit >= 0 ? "plus" : "minus"}">${flat.profit >= 0 ? "+" : ""}${flat.profit.toFixed(2)} €</b>
      ${flat.n ? `(${(100 * flat.profit / flat.n).toFixed(1)}% ROI)` : ""}</p>
    ${rows.length ? `<details class="lines"><summary>Value bets in detail</summary><div class="table-wrap"><table>
      <thead><tr><th class="left">Game</th><th class="left">Bet</th><th>Odds</th><th>Model</th><th>Value</th><th>Final</th><th>Result</th></tr></thead>
      <tbody>${rows.map(({ g, s, priced, r }) => `<tr>
        <td class="left"><a href="#game/${g.code}">R${g.round} ${esc(teamById[g.home].short)}–${esc(teamById[g.away].short)}</a></td>
        <td class="left">${esc(betLabel(g, s))}</td><td>${s.odds.toFixed(2)}</td><td>${pct(s.model)}</td>
        <td>${evText(priced.ev)}</td><td>${g.score.join("–")}</td><td>${fmtOut(r)}</td></tr>`).join("")}</tbody>
    </table></div></details>` : ""}
    <p class="note">Judge this after 100+ bets: over a few rounds it is mostly luck. A model that beats the
      bookmaker's log loss over a season is rare; profit without that is probably luck too.</p>
  </div>`;
}

function betLabel(g, s) {
  const h = teamById[g.home], a = teamById[g.away];
  if (s.market === "ml") return `${(s.side === "home" ? h : a).name} to win`;
  if (s.market === "hcp") return s.side === "home" ? `${h.name} ${signed(s.line)}` : `${a.name} ${signed(-s.line)}`;
  return `${s.side === "over" ? "Over" : "Under"} ${s.line}`;
}

// move everything saved to another browser
function exportData() {
  const data = { version: 1, exported: new Date().toISOString(), oddsLog, myBets, lineups, odds, settings: betSettings };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `euroleague-bets-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  URL.revokeObjectURL(url);
}
function importData(file) {
  file.text().then(text => {
    const d = JSON.parse(text);
    // merge: imported odds history is added to what is here, newer entries win per game
    for (const [code, list] of Object.entries(d.oddsLog || {})) {
      const mine = oddsLog[code] || [];
      const byTime = new Map([...mine, ...list].map(e => [e.t, e]));
      oddsLog[code] = [...byTime.values()].sort((x, y) => Date.parse(x.t) - Date.parse(y.t));
    }
    const ids = new Set(myBets.map(b => b.id));
    myBets = myBets.concat((d.myBets || []).filter(b => !ids.has(b.id)));
    Object.assign(lineups, d.lineups || {});
    Object.assign(odds, d.odds || {});
    save("bets.oddsLog", oddsLog); save("bets.log", myBets); save("bets.out", lineups); save("bets.odds", odds);
    route();
  }).catch(() => alert("That file could not be read."));
}

function myBetsCard() {
  if (!myBets.length) return "";
  let staked = 0, profit = 0, open = 0;
  const rows = myBets.map(b => {
    const r = settle(b), g = gameByCode[b.code];
    if (r === null) open += b.stake; else { staked += b.stake; profit += r; }
    const status = r === null ? "<span class='muted'>open</span>"
      : r > 0 ? `<span class="plus">won +${r.toFixed(2)}</span>`
      : r < 0 ? `<span class="minus">lost ${r.toFixed(2)}</span>` : "push";
    return `<tr>
      <td class="left">${g ? `<a href="#game/${g.code}">R${g.round} ${esc(teamById[g.home].short)}–${esc(teamById[g.away].short)}</a>` : esc(b.code)}</td>
      <td class="left">${esc(b.label)}</td><td>${b.odds.toFixed(2)}</td><td>${b.stake.toFixed(2)}</td>
      <td>${g && g.score ? g.score.join("–") : ""}</td><td>${status}</td>
      <td><button class="link" data-del="${b.id}" title="Remove">✕</button></td></tr>`;
  }).join("");
  return `<div class="card">
    <h2>My bets</h2>
    <p class="record">Settled: staked <b>${staked.toFixed(2)}</b> · profit
      <b class="${profit >= 0 ? "plus" : "minus"}">${profit >= 0 ? "+" : ""}${profit.toFixed(2)}</b>
      ${staked ? `(${(100 * profit / staked).toFixed(1)}% ROI)` : ""} · open: ${open.toFixed(2)}</p>
    <div class="table-wrap"><table>
      <thead><tr><th class="left">Game</th><th class="left">Bet</th><th>Odds</th><th>Stake</th><th>Final</th><th>Result</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="note">Saved in this browser only. Results fill in automatically after the data update.</p>
  </div>`;
}

// ---------- page ----------
function oddsInput(code, key, i, placeholder, step = "0.01") {
  const v = odds[code]?.[key]?.[i];
  return `<input type="number" inputmode="decimal" step="${step}" data-code="${code}" data-key="${key}" data-i="${i}"
    placeholder="${placeholder}" value="${v ?? ""}" ${started(gameByCode[code]) ? "disabled" : ""}>`;
}

function fairOdds(p) { return p > 0 ? (1 / p).toFixed(2) : "–"; }

function lineupList(g, team) {
  const regs = regulars(team);
  if (!regs.length) return `<p class="muted">Not enough games yet.</p>`;
  return regs.map((p, i) => `<label class="lineup ${p[3] ? "muted" : ""} ${i < ABS.keyPlayers ? "key" : ""}">
      <input type="checkbox" data-player="${p[0]}" ${isOut(g, p) ? "checked" : ""} ${p[3] ? "disabled" : ""}>
      <span>${i < ABS.keyPlayers ? "★ " : ""}${esc(playerName[p[0]] || p[0])}</span>
      <small>${p[3] ? "left club · " : p[2] ? "missed last game · " : ""}${p[1].toFixed(1)} PIR</small>
    </label>`).join("");
}

function modelBox(g) {
  const sim = simulate(g), p = sim.pred, h = teamById[g.home], a = teamById[g.away];
  const pHome = chances(sim, "ml", "home", 0).win;
  const fairHcp = -median(sim.margins), fairTot = median(sim.totals);
  // model probabilities at lines around the fair ones, for quick comparison with the bookmaker
  const hcpLines = [-6, -3, 0, 3, 6].map(d => Math.round(fairHcp) + d + 0.5);
  const totLines = [-8, -4, 0, 4, 8].map(d => Math.round(fairTot) + d + 0.5);
  const names = list => list.map(x => esc(playerName[x[0]] || x[0]) + (x[3] ? " (left club)" : "")).join(", ");
  const outs = [[h, p.outHome], [a, p.outAway]].filter(([, l]) => l.length)
    .map(([t, l]) => `${esc(t.short)} without ${names(l)}`).join("; ");
  const shift = Math.abs(p.shift) >= 0.05
    ? ` · line-ups move the margin <b>${signed(+p.shift.toFixed(1))}</b> for ${esc(h.short)}` : "";
  return `
    <p class="model-line">Model: <b>${p.homePts}–${p.awayPts}</b> · ${esc(h.short)} wins ${pct(pHome)}
      (fair odds ${fairOdds(pHome)} / ${fairOdds(1 - pHome)}) · fair handicap <b>${esc(h.short)} ${signed(fairHcp)}</b>
      · fair total <b>${fairTot}</b>${shift}</p>
    ${outs ? `<p class="note out-line">Key players out: ${outs}</p>` : ""}
    <details class="lines" data-details="lineup"><summary>Line-ups: tick players who won't play</summary>
      <div class="grid-2">
        <div><div class="round-title">${esc(h.name)}</div>${lineupList(g, g.home)}</div>
        <div><div class="round-title">${esc(a.name)}</div>${lineupList(g, g.away)}</div>
      </div>
      <p class="note">Regulars by PIR per game. ★ = key player: each one who misses the game costs his team
        about ${ABS.perPlayer} points (measured on the last three seasons); other players don't move the prediction.
        Players who missed the team's latest game are ticked automatically: check the injury news and correct it.
        <button class="link" data-reset="${g.code}">Reset</button></p>
    </details>
    <details class="lines" data-details="chances"><summary>Model chances at other lines</summary>
      <div class="grid-2">
        <table><thead><tr><th class="left">${esc(h.short)} handicap</th><th>${esc(h.short)} covers</th><th>Fair odds</th></tr></thead><tbody>
          ${hcpLines.map(l => { const c = chances(sim, "hcp", "home", l).win;
            return `<tr><td class="left">${signed(l)}</td><td>${pct(c)}</td><td>${fairOdds(c)}</td></tr>`; }).join("")}
        </tbody></table>
        <table><thead><tr><th class="left">Total</th><th>Over</th><th>Fair odds</th></tr></thead><tbody>
          ${totLines.map(l => { const c = chances(sim, "tot", "over", l).win;
            return `<tr><td class="left">${l}</td><td>${pct(c)}</td><td>${fairOdds(c)} / ${fairOdds(1 - c)}</td></tr>`; }).join("")}
        </tbody></table>
      </div>
    </details>`;
}

function gameCard(g) {
  const h = teamById[g.home], a = teamById[g.away];
  return `<div class="card bet-game" data-code="${g.code}">
    ${gameRow(g, true)}
    <div class="model-box">${modelBox(g)}</div>
    ${started(g) ? `<p class="note">Started: odds are locked, the history keeps those saved before tip-off.</p>` : ""}
    <div class="odds-grid">
      <span class="lbl">Winner</span>
      <label>${esc(h.short)} ${oddsInput(g.code, "ml", 0, "odds")}</label>
      <label>${esc(a.short)} ${oddsInput(g.code, "ml", 1, "odds")}</label>
      <span></span>
      <span class="lbl">Handicap</span>
      <label>${esc(h.short)} line ${oddsInput(g.code, "hcp", 0, "-4.5", "0.5")}</label>
      <label>${esc(h.short)} ${oddsInput(g.code, "hcp", 1, "odds")}</label>
      <label>${esc(a.short)} ${oddsInput(g.code, "hcp", 2, "odds")}</label>
      <span class="lbl">Total</span>
      <label>line ${oddsInput(g.code, "tot", 0, "160.5", "0.5")}</label>
      <label>over ${oddsInput(g.code, "tot", 1, "odds")}</label>
      <label>under ${oddsInput(g.code, "tot", 2, "odds")}</label>
    </div>
    <div class="sel-table"></div>
  </div>`;
}

function selTable(sels) {
  if (!sels.length) return "";
  return `<div class="table-wrap"><table>
    <thead><tr><th class="left">Bet</th><th>Odds</th><th>Bookmaker</th><th>Model</th><th>Used</th><th>Value</th><th>Stake</th><th></th></tr></thead>
    <tbody>${sels.map(s => `<tr class="${isValue(s) ? "value" : ""}">
      <td class="left">${esc(s.label)}</td><td>${s.odds.toFixed(2)}</td>
      <td>${s.fair == null ? "–" : pct(s.fair)}</td><td>${pct(s.model)}</td><td>${pct(s.pWin)}</td>
      <td>${evText(s.ev)}</td><td>${s.stake ? s.stake.toFixed(2) : "–"}</td>
      <td>${s.stake ? `<button class="link" data-add='${esc(JSON.stringify({ code: s.game.code, market: s.market, side: s.side, line: s.line, odds: s.odds, stake: s.stake, label: s.label }))}'>+ my bets</button>` : ""}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

pages.bets = () => {
  const nr = nextRound();
  if (!nr) return `<div id="betsPage"><h1>Betting</h1><div class="card"><p class="muted">No upcoming games.</p></div>
    <div id="myBets">${myBetsCard()}</div><div id="history">${historyCard()}</div></div>`;
  const games = upcoming.filter(g => g.round === nr);
  const s = betSettings;
  return `<div id="betsPage"><h1>Betting — Round ${nr}</h1>
    <div class="card">
      ${published.source ? `<p class="note" style="margin-top:0">Odds already filled in: ${esc(published.source)}, ${esc(published.taken)}
        (winner only). Change them if the price has moved.</p>` : ""}
      <p style="margin-top:0">Each game is simulated ${SIMS.toLocaleString("en")} times from the model's prediction, with
        the spread of real results around its predictions measured on 1,063 past games
        (final score, overtime included). Type in the bookmaker's
        decimal odds; bets where the model sees value are highlighted with a suggested stake.</p>
      <div class="controls settings">
        <label>Bankroll <input type="number" id="sBankroll" min="0" step="10" value="${s.bankroll}"></label>
        <label>Model weight <input type="number" id="sWeight" min="0" max="100" step="10" value="${s.modelWeight}">%</label>
        <label>Min value <input type="number" id="sEdge" min="0" step="1" value="${s.minEdge}">%</label>
        <label>Kelly <input type="number" id="sKelly" min="0" max="1" step="0.05" value="${s.kelly}"></label>
        <label>Max stake <input type="number" id="sMax" min="0" step="0.5" value="${s.maxPct}">% of bankroll</label>
      </div>
      <p class="note">
        <b>Bookmaker</b> = the bookmaker's chance with its margin removed. <b>Model</b> = simulation.
        <b>Used</b> = blend of both by "model weight": the bookmaker follows the news more closely than the model.
        <b>Value</b> = expected return per 1 € staked. <b>Stake</b> = ${s.kelly} Kelly, at most ${s.maxPct}% of bankroll.
      </p>
    </div>
    <div class="card">
      <h2>Odds template</h2>
      <p class="note" style="margin-top:0">Faster than typing: copy the template, fill in TopSport's odds (in a notes app or
        right here), then paste it back below and press Apply. The same text can be pasted into a chat with Claude.</p>
      <div class="controls"><button id="copyTemplate">Copy template</button><button class="primary" id="applyTemplate">Apply</button>
        <span id="templateMsg" class="note"></span></div>
      <textarea id="templateBox" rows="8" spellcheck="false">${esc(oddsTemplate(games))}</textarea>
    </div>
    <div class="card" id="bestBets"></div>
    ${games.map(gameCard).join("")}
    <div id="myBets">${myBetsCard()}</div>
    <div id="history">${historyCard()}</div>
    <div class="card">
      <h2>Your data</h2>
      <p class="note" style="margin-top:0">Odds history, bets and line-ups are saved in this browser only.
        Export a file to keep a backup or to move them to your phone; importing adds to what is here.</p>
      <div class="controls" style="margin-bottom:0">
        <button id="exportBtn">Export</button>
        <label class="button-like">Import <input type="file" id="importFile" accept="application/json,.json" hidden></label>
      </div>
    </div>
    <div class="card note">
      <h2>Read this before betting</h2>
      <p>The model picks about 67% of winners, but bookmakers' prices are usually at least as good, and their
        margin (typically 5–8%) has to be beaten first. "Value" here means the model disagrees with the bookmaker;
        it is not a guarantee. The model only knows who missed each team's latest game: tick injured key players
        yourself from the news before betting. On past seasons, knowing the line-ups improved the model only a
        little (winners 66.6% → 66.8%): bookmakers react to injury news fast, so the edge is in being quicker.
        Over a few rounds results are mostly luck; keep the log below to see whether it works over 100+ bets.</p>
      <p>Totals (over/under) are the weakest part: on past seasons the model missed the total by 13.3 points on
        average, barely better than just using the league average (13.9). Winner and handicap bets rest on firmer ground.</p>
      <p>Bet only money you can afford to lose. Help in Lithuania: Lošimų priežiūros tarnyba, tel. 8 800 222 99 (free).</p>
    </div></div>`;
};

setup.bets = () => {
  recordPublished();
  const nr = nextRound();
  const games = nr ? upcoming.filter(g => g.round === nr) : [];

  const renderGame = card => {
    const g = gameByCode[card.dataset.code];
    card.querySelector(".sel-table").innerHTML = selTable(selections(g));
  };
  const renderBest = () => {
    const box = document.getElementById("bestBets");
    if (!box) return;
    const all = games.flatMap(selections);
    const best = all.filter(isValue).sort((a, b) => b.ev - a.ev);
    const total = best.reduce((t, s) => t + s.stake, 0);
    box.innerHTML = `<h2>Best value this round</h2>` + (!all.length
      ? "<p class='muted'>Type in bookmaker odds below to compare them with the model.</p>"
      : best.length
        ? selTable(best) + `<p class="note">${best.length} bet${best.length > 1 ? "s" : ""}, total stake ${total.toFixed(2)}.</p>`
        : `<p class="muted">No bet reaches ${betSettings.minEdge}% value at the odds entered.</p>`);
  };
  const renderAll = () => {
    document.querySelectorAll(".bet-game").forEach(renderGame);
    renderBest();
  };

  document.querySelectorAll(".odds-grid input").forEach(inp => inp.addEventListener("input", () => {
    const { code, key, i } = inp.dataset;
    const size = key === "ml" ? 2 : 3;
    odds[code] = odds[code] || {};
    odds[code][key] = odds[code][key] || Array(size).fill(null);
    odds[code][key][i] = inp.value === "" ? null : Number(inp.value);
    save("bets.odds", odds);
    renderGame(inp.closest(".bet-game"));
    renderBest();
    scheduleRecord(gameByCode[code]);
  }));

  const timers = {};
  const scheduleRecord = g => {
    clearTimeout(timers[g.code]);
    timers[g.code] = setTimeout(() => { recordOdds(g); document.getElementById("history").innerHTML = historyCard(); }, 1500);
  };

  // line-up changes: redraw that game's model part, keeping open sections open
  const redrawModel = card => {
    const box = card.querySelector(".model-box");
    const open = [...box.querySelectorAll("details[open]")].map(d => d.dataset.details);
    box.innerHTML = modelBox(gameByCode[card.dataset.code]);
    open.forEach(k => box.querySelector(`details[data-details="${k}"]`)?.setAttribute("open", ""));
    renderGame(card);
    renderBest();
  };
  const page = document.getElementById("betsPage");
  page && page.addEventListener("change", e => {
    const cb = e.target.closest("input[data-player]");
    if (!cb) return;
    const card = cb.closest(".bet-game"), code = card.dataset.code;
    lineups[code] = lineups[code] || {};
    lineups[code][cb.dataset.player] = cb.checked;
    save("bets.out", lineups);
    redrawModel(card);
    if (oddsLog[code] && !started(gameByCode[code])) scheduleRecord(gameByCode[code]);
  });

  document.getElementById("exportBtn")?.addEventListener("click", exportData);

  const box = document.getElementById("templateBox"), msg = document.getElementById("templateMsg");
  document.getElementById("copyTemplate")?.addEventListener("click", () => {
    box.value = oddsTemplate(games);
    box.select();
    (navigator.clipboard ? navigator.clipboard.writeText(box.value) : Promise.reject())
      .then(() => { msg.textContent = "Copied."; }, () => { document.execCommand("copy"); msg.textContent = "Copied."; });
  });
  document.getElementById("applyTemplate")?.addEventListener("click", () => {
    const n = applyTemplate(box.value);
    route(); // redraw everything with the new odds
    const m = document.getElementById("templateMsg");
    if (m) m.textContent = n ? `Odds updated for ${n} game${n > 1 ? "s" : ""}.` : "No odds found: keep the #number lines.";
  });
  document.getElementById("importFile")?.addEventListener("change", e => e.target.files[0] && importData(e.target.files[0]));

  const fields = { sBankroll: "bankroll", sWeight: "modelWeight", sEdge: "minEdge", sKelly: "kelly", sMax: "maxPct" };
  Object.entries(fields).forEach(([id, key]) => {
    const inp = document.getElementById(id);
    inp && inp.addEventListener("input", () => {
      if (inp.value === "" || !isFinite(inp.value)) return;
      betSettings[key] = Number(inp.value);
      save("bets.settings", betSettings);
      renderAll();
    });
  });

  // add / remove bets in the log, reset line-ups (buttons are re-rendered, so listen on the page)
  page && page.addEventListener("click", e => {
    const add = e.target.closest("[data-add]"), del = e.target.closest("[data-del]");
    const reset = e.target.closest("[data-reset]");
    if (reset) {
      delete lineups[reset.dataset.reset];
      save("bets.out", lineups);
      redrawModel(reset.closest(".bet-game"));
      if (oddsLog[reset.dataset.reset]) scheduleRecord(gameByCode[reset.dataset.reset]);
      return;
    }
    if (add) {
      myBets.push({ id: Date.now(), placed: new Date().toISOString(), ...JSON.parse(add.dataset.add) });
      add.textContent = "✓ added";
      add.disabled = true;
    } else if (del) {
      myBets = myBets.filter(b => String(b.id) !== del.dataset.del);
    } else return;
    save("bets.log", myBets);
    document.getElementById("myBets").innerHTML = myBetsCard();
  });

  renderAll();
};
