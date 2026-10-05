// =====================================================================
//  Betting page (#bets): Monte Carlo simulation of the next round,
//  compared with bookmaker odds you type in (e.g. TopSport).
//  Loaded after app.js and uses its helpers (esc, teamById, predict, ...).
//  Odds, settings and your bet log are saved in this browser only.
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
let myBets = load("bets.log", []);    // [{ id, code, market, side, line, odds, stake, placed }]

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
  if (simCache[g.code]) return simCache[g.code];
  const p = predict(g.home, g.away, g.neutral);
  const mu = p.margin + SIM.marginBias, tot = p.total + SIM.totalBias;
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
  return simCache[g.code] = { margins, totals, pred: p };
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

  const sim = simulate(g), w = betSettings.modelWeight / 100;
  return out.map(s => {
    const c = chances(sim, s.market, s.side, s.line);
    // the market price knows about injuries and news the model doesn't: blend toward it
    const winNoPush = c.win / (1 - c.push || 1);
    const blended = s.fair == null ? winNoPush : w * winNoPush + (1 - w) * s.fair;
    const pWin = blended * (1 - c.push);
    const ev = pWin * s.odds + c.push - 1;
    return { ...s, game: g, model: c.win, push: c.push, pWin, ev, stake: stake(pWin, c.push, s.odds) };
  });
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
function settle(b) {
  const g = gameByCode[b.code];
  if (!g || !g.score) return null;
  const m = g.score[0] - g.score[1], t = g.score[0] + g.score[1];
  let x;
  if (b.market === "ml") x = b.side === "home" ? m : -m;
  else if (b.market === "hcp") x = b.side === "home" ? m + b.line : -m - b.line;
  else x = b.side === "over" ? t - b.line : b.line - t;
  return x > 0 ? b.stake * (b.odds - 1) : x === 0 ? 0 : -b.stake;
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
    placeholder="${placeholder}" value="${v ?? ""}">`;
}

function fairOdds(p) { return p > 0 ? (1 / p).toFixed(2) : "–"; }

function gameCard(g) {
  const sim = simulate(g), p = sim.pred, h = teamById[g.home], a = teamById[g.away];
  const pHome = chances(sim, "ml", "home", 0).win;
  const fairHcp = -median(sim.margins), fairTot = median(sim.totals);
  // model probabilities at lines around the fair ones, for quick comparison with the bookmaker
  const hcpLines = [-6, -3, 0, 3, 6].map(d => Math.round(fairHcp) + d + 0.5);
  const totLines = [-8, -4, 0, 4, 8].map(d => Math.round(fairTot) + d + 0.5);
  return `<div class="card bet-game" data-code="${g.code}">
    ${gameRow(g, true)}
    <p class="model-line">Model: <b>${p.homePts}–${p.awayPts}</b> · ${esc(h.short)} wins ${pct(pHome)}
      (fair odds ${fairOdds(pHome)} / ${fairOdds(1 - pHome)}) · fair handicap <b>${esc(h.short)} ${signed(fairHcp)}</b>
      · fair total <b>${fairTot}</b></p>
    <details class="lines"><summary>Model chances at other lines</summary>
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
    </details>
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
  if (!nr) return `<div id="betsPage"><h1>Betting</h1><div class="card"><p class="muted">No upcoming games.</p></div><div id="myBets">${myBetsCard()}</div></div>`;
  const games = upcoming.filter(g => g.round === nr);
  const s = betSettings;
  return `<div id="betsPage"><h1>Betting — Round ${nr}</h1>
    <div class="card">
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
        <b>Used</b> = blend of both by "model weight": the bookmaker knows about injuries and news, the model doesn't.
        <b>Value</b> = expected return per 1 € staked. <b>Stake</b> = ${s.kelly} Kelly, at most ${s.maxPct}% of bankroll.
      </p>
    </div>
    <div class="card" id="bestBets"></div>
    ${games.map(gameCard).join("")}
    <div id="myBets">${myBetsCard()}</div>
    <div class="card note">
      <h2>Read this before betting</h2>
      <p>The model picks about 67% of winners, but bookmakers' prices are usually at least as good, and their
        margin (typically 5–8%) has to be beaten first. "Value" here means the model disagrees with the bookmaker;
        it is not a guarantee. The model doesn't know about injuries, rest or line-ups — check the news before betting.
        Over a few rounds results are mostly luck; keep the log below to see whether it works over 100+ bets.</p>
      <p>Totals (over/under) are the weakest part: on past seasons the model missed the total by 13.3 points on
        average, barely better than just using the league average (13.9). Winner and handicap bets rest on firmer ground.</p>
      <p>Bet only money you can afford to lose. Help in Lithuania: Lošimų priežiūros tarnyba, tel. 8 800 222 99 (free).</p>
    </div></div>`;
};

setup.bets = () => {
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
  }));

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

  // add / remove bets in the log (buttons are re-rendered, so listen on the page)
  const page = document.getElementById("betsPage");
  page && page.addEventListener("click", e => {
    const add = e.target.closest("[data-add]"), del = e.target.closest("[data-del]");
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
