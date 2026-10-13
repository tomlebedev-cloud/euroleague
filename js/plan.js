// =====================================================================
//  Staking plan page (#plan): type in your bankroll, pick a staking style,
//  and get the slip for the round: which bets, how much on each, ready to
//  enter at the bookmaker. A chart compares the staking styles over 100 bets.
//  Loaded after ticket.js; uses betting.js (selections, isValue, betSettings, ...).
// =====================================================================

// Staking styles: share of the Kelly stake, and the most one bet may take of the bankroll.
const STYLES = [
  { id: "cautious", kelly: 0.25, maxPct: 2, name: ["Cautious", "Atsargus"],
    note: ["¼ Kelly, at most 2% per bet", "¼ Kelly, ne daugiau 2 % vienam statymui"] },
  { id: "balanced", kelly: 0.5, maxPct: 5, name: ["Balanced", "Vidutinis"],
    note: ["½ Kelly, at most 5% per bet", "½ Kelly, ne daugiau 5 % vienam statymui"] },
  { id: "aggressive", kelly: 1, maxPct: 10, name: ["Aggressive", "Agresyvus"],
    note: ["full Kelly, at most 10% per bet", "visas Kelly, ne daugiau 10 % vienam statymui"] },
];
// shown in the chart only, as a warning: a quarter of the bankroll on every bet
const CHASE = { id: "chase", flat: 0.25, name: ["Chasing 4x", "Vaikantis 4x"],
  note: ["25% of the bankroll on every bet", "25 % banko kiekvienam statymui"] };

const currentStyle = () => STYLES.find(s => s.kelly === betSettings.kelly && s.maxPct === betSettings.maxPct) || null;

// ---------- which staking style is best: 100 bets, many times over ----------
// Typical value bets as the ticket page finds them: bookmaker odds, the chance the model
// believes (already blended with the bookmaker's), and the bookmaker's own chance.
const TYPICAL_BETS = [
  { odds: 1.65, believed: 0.65, fair: 0.575 },
  { odds: 1.95, believed: 0.56, fair: 0.49 },
  { odds: 2.20, believed: 0.50, fair: 0.435 },
  { odds: 3.30, believed: 0.33, fair: 0.29 },
];
const SIM_BETS = 100, SIM_RUNS = 4000;

function simulateStyle(style, modelRight) {
  const rand = rng(style.id.length * 7717 + (modelRight ? 1 : 2));
  const finals = new Float64Array(SIM_RUNS);
  for (let r = 0; r < SIM_RUNS; r++) {
    let bank = 1;
    for (let i = 0; i < SIM_BETS && bank > 0.005; i++) {
      const b = TYPICAL_BETS[Math.floor(rand() * TYPICAL_BETS.length)];
      const kellyStake = (b.believed * b.odds - 1) / (b.odds - 1); // share of the bankroll full Kelly would stake
      const share = style.flat ?? Math.min(kellyStake * style.kelly, style.maxPct / 100);
      const stake = bank * share;
      bank += rand() < (modelRight ? b.believed : b.fair) ? stake * (b.odds - 1) : -stake;
    }
    finals[r] = bank;
  }
  finals.sort();
  const q = p => finals[Math.min(SIM_RUNS - 1, Math.floor(p * SIM_RUNS))];
  return {
    low: q(0.1), mid: q(0.5), high: q(0.9),
    lostHalf: finals.filter(x => x < 0.5).length / SIM_RUNS,
    times4: finals.filter(x => x >= 4).length / SIM_RUNS,
  };
}

let styleStats = null;
function allStyleStats() {
  styleStats = styleStats || [...STYLES, CHASE].map(s => ({ style: s, right: simulateStyle(s, true), wrong: simulateStyle(s, false) }));
  return styleStats;
}

// range chart: for each style two bars (model right / bookmaker right) from the bad to the good
// outcome, a dot at the typical one, and a line at "bankroll unchanged"
function styleChart(bankroll) {
  const stats = allStyleStats();
  const W = 720, left = 150, right = 70, rowH = 62, top = 30, H = top + rowH * stats.length + 34;
  const MAX = 3; // bankroll multiples shown; longer bars are cut with an arrow
  const x = v => left + (Math.min(v, MAX) / MAX) * (W - left - right);
  const money = v => `${Math.round(v * bankroll)} €`;
  const ticks = [0, 0.5, 1, 1.5, 2, 2.5, 3];
  const series = [["right", "s1", L("If the model is right", "Jei modelis teisus")],
                  ["wrong", "s2", L("If the bookmaker is right", "Jei teisi lažybų bendrovė")]];
  const rows = stats.map((st, i) => {
    const y0 = top + i * rowH;
    const bars = series.map(([key, cls, label], k) => {
      const d = st[key], y = y0 + 12 + k * 20, cut = d.high > MAX;
      const tip = `${L(...st.style.name)} · ${label}: ${L("typical", "įprastai")} ${money(d.mid)}, ${L("bad run", "nesėkmės atveju")} ${money(d.low)},
        ${L("good run", "sėkmės atveju")} ${money(d.high)}`.replace(/\s+/g, " ");
      return `<g class="bar" data-tip="${esc(tip)}">
        <rect class="hit" x="${left}" y="${y - 4}" width="${W - left - right}" height="20"></rect>
        <rect class="${cls}" x="${x(d.low)}" y="${y}" width="${Math.max(x(d.high) - x(d.low), 3)}" height="12" rx="4"></rect>
        ${cut ? `<path class="${cls}" d="M${x(MAX) + 2} ${y} l8 6 l-8 6 z"></path>` : ""}
        <circle class="dot" cx="${x(d.mid)}" cy="${y + 6}" r="5"></circle>
        <text class="val" x="${W - right + 14}" y="${y + 10}">${money(d.mid)}</text>
      </g>`;
    }).join("");
    return `<text class="name" x="0" y="${y0 + 24}">${esc(L(...st.style.name))}</text>
      <text class="sub" x="0" y="${y0 + 40}">${st.style.flat ? "25 %" : `${st.style.kelly === 1 ? "1" : st.style.kelly === 0.5 ? "½" : "¼"} Kelly · max ${st.style.maxPct} %`}</text>
      ${bars}
      ${i ? `<line class="sep" x1="0" x2="${W}" y1="${y0}" y2="${y0}"></line>` : ""}`;
  }).join("");
  return `<div class="plan-chart">
    <div class="chart-legend">
      ${series.map(([, cls, label]) => `<span><i class="${cls}"></i>${esc(label)}</span>`).join("")}
      <span><i class="dot-key"></i>${L("typical result", "įprastas rezultatas")}</span>
    </div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${L("Bankroll after 100 bets by staking style", "Bankas po 100 statymų pagal statymo būdą")}">
      ${ticks.map(t => `<line class="${t === 1 ? "start" : "grid"}" x1="${x(t)}" x2="${x(t)}" y1="${top - 6}" y2="${H - 30}"></line>
        <text class="tick" x="${x(t)}" y="${H - 12}" text-anchor="middle">${money(t)}</text>`).join("")}
      <text class="tick" x="${x(1)}" y="${top - 12}" text-anchor="middle">${L("start", "pradžia")}</text>
      <text class="tick" x="${W - right + 14}" y="${top - 12}">${L("typical", "įprastai")}</text>
      ${rows}
    </svg>
    <div class="chart-tip" hidden></div>
  </div>`;
}

function styleTable(bankroll) {
  const money = v => `${Math.round(v * bankroll)} €`;
  const row = (st, key, label) => {
    const d = st[key];
    return `<tr><td class="left">${esc(L(...st.style.name))}</td><td class="left">${label}</td><td>${money(d.low)}</td>
      <td><b>${money(d.mid)}</b></td><td>${money(d.high)}</td><td>${pct(d.lostHalf)}</td><td>${pct(d.times4)}</td></tr>`;
  };
  return `<details class="lines"><summary>${L("The same as a table", "Tas pats lentelėje")}</summary><div class="table-wrap"><table>
    <thead><tr><th class="left">${L("Style", "Būdas")}</th><th class="left">${L("If right is", "Jei teisus")}</th>
      <th>${L("Bad run", "Nesėkmė")}</th><th>${L("Typical", "Įprastai")}</th><th>${L("Good run", "Sėkmė")}</th>
      <th>${L("Lose half", "Prarasti pusę")}</th><th>${L("Reach 4x", "Pasiekti 4x")}</th></tr></thead>
    <tbody>${allStyleStats().map(st => row(st, "right", L("model", "modelis")) + row(st, "wrong", L("bookmaker", "lažybų bendr."))).join("")}</tbody>
  </table></div></details>`;
}

// ---------- the slip ----------
function slipRows(games) {
  return games.flatMap(selections).filter(isValue).sort((a, b) => tipOff(a.game) - tipOff(b.game) || b.ev - a.ev)
    .map(s => ({ ...s, minOdds: (1 + betSettings.minEdge / 100) / s.pWin, underdog: s.market === "ml" && s.model < 0.5 }));
}

function slipText(rows) {
  return rows.map((s, i) => {
    const g = s.game;
    return `${i + 1}. ${teamById[g.home].name} – ${teamById[g.away].name} (${fmtDate(g.date)} ${fmtTime(g.date)}) | ${s.label} | ${s.odds.toFixed(2)} | ${s.stake.toFixed(2)} €`;
  }).join("\n");
}

pages.plan = params => {
  const nr = chosenRound(params);
  const bank = betSettings.bankroll, style = currentStyle();
  const games = nr ? upcoming.filter(g => g.round === nr && !started(g)) : [];
  const rows = slipRows(games);
  const total = rows.reduce((t, s) => t + s.stake, 0);
  const win = rows.reduce((t, s) => t + s.stake * (s.odds - 1), 0);
  const marketName = { ml: L("Winner (incl. overtime)", "Nugalėtojas (su pratęsimu)"), hcp: L("Handicap", "Fora"), tot: L("Total", "Totalas") };

  const slip = !nr ? `<p class="muted">${L("No upcoming games.", "Artimiausių rungtynių nėra.")}</p>`
    : !rows.length ? `<p class="muted">${L(`No bet reaches ${betSettings.minEdge}% value at the current odds. The plan for this round: keep the money.`,
        `Prie dabartinių koeficientų nė vienas statymas nepasiekia ${betSettings.minEdge} % vertės. Šio turo planas: pinigų nestatyti.`)}</p>`
    : `<div class="table-wrap"><table>
        <thead><tr><th>#</th><th class="left">${L("Game", "Rungtynės")}</th><th class="left">${L("Market", "Rinka")}</th>
          <th class="left">${L("Pick", "Pasirinkimas")}</th><th>${L("Odds", "Koef.")}</th><th>${L("Stake", "Suma")}</th>
          <th>${L("If it wins", "Jei laimi")}</th><th>${L("Skip below", "Nestatyti žemiau")}</th></tr></thead>
        <tbody>${rows.map((s, i) => `<tr>
          <td class="muted">${i + 1}</td>
          <td class="left"><a href="#game/${s.game.code}">${esc(teamById[s.game.home].short)}–${esc(teamById[s.game.away].short)}</a>
            <span class="muted">${fmtDate(s.game.date)} ${fmtTime(s.game.date)}</span></td>
          <td class="left muted">${marketName[s.market]}</td>
          <td class="left"><b>${esc(s.label)}</b>${s.underdog ? ` <span class="minus">${L("underdog", "autsaideris")}</span>` : ""}</td>
          <td>${s.odds.toFixed(2)}</td><td><b>${s.stake.toFixed(2)} €</b></td>
          <td class="plus">+${(s.stake * (s.odds - 1)).toFixed(2)} €</td><td>${s.minOdds.toFixed(2)}</td>
        </tr>`).join("")}</tbody>
      </table></div>
      <p class="record">${L("Staked this round", "Šiame ture statoma")}: <b>${total.toFixed(2)} €</b> (${(100 * total / (bank || 1)).toFixed(1)} % ${L("of the bankroll", "banko")})
        · ${L("stays untouched", "lieka nepaliesta")}: <b>${(bank - total).toFixed(2)} €</b>
        · ${L("if every bet wins", "jei laimi visi")}: <span class="plus">+${win.toFixed(2)} €</span>
        · ${L("if every bet loses", "jei pralaimi visi")}: <span class="minus">−${total.toFixed(2)} €</span></p>
      <div class="controls" style="margin-bottom:0"><button id="copySlip">${L("Copy the slip", "Kopijuoti sąrašą")}</button>
        <span id="slipMsg" class="note"></span></div>
      <p class="note">${L(`Each line is its own single bet at the bookmaker, not a combo. Check the odds before you confirm: if they
        have dropped below "Skip below", the value is gone. Why these bets: see the <a href="#ticket/${nr}">Ticket</a> page.`,
        `Kiekviena eilutė yra atskiras viengubas statymas, ne kombinuotas. Prieš patvirtindami patikrinkite koeficientą: jei jis
        nukrito žemiau stulpelio „Nestatyti žemiau“, vertės nebėra. Kodėl šie statymai: žr. puslapį <a href="#ticket/${nr}">Bilietas</a>.`)}</p>`;

  return `<div id="planPage"><h1>${nr ? L(`Staking plan — Round ${nr}`, `Statymų planas — ${nr} turas`) : L("Staking plan", "Statymų planas")}</h1>
    ${roundTabs("plan", nr)}
    <div class="card">
      <h2>${L("1. Your bankroll and style", "1. Jūsų bankas ir statymo būdas")}</h2>
      <div class="controls settings">
        <label>${L("Bankroll", "Bankas")} <input type="number" id="pBankroll" min="0" step="10" value="${bank}"> €</label>
        ${STYLES.map(s => `<button class="style-btn ${style === s ? "primary" : ""}" data-style="${s.id}">${L(...s.name)}</button>`).join("")}
      </div>
      <p class="note" style="margin-bottom:0">${style
        ? `<b>${L(...style.name)}</b>: ${L(...style.note)} (${L("here", "čia")} ${(bank * style.maxPct / 100).toFixed(2)} €).`
        : L(`Custom settings from the Betting page: ${betSettings.kelly} Kelly, at most ${betSettings.maxPct}% per bet.`,
            `Savi nustatymai iš Statymų puslapio: ${betSettings.kelly} Kelly, ne daugiau ${betSettings.maxPct} % vienam statymui.`)}
        ${L(`The bankroll is the money set aside for the whole season, not for one round.`,
            `Bankas yra visam sezonui atidėta suma, ne vieno turo pinigai.`)}</p>
    </div>
    <div class="card">
      <h2>${L("2. Your slip for this round", "2. Jūsų statymų sąrašas šiam turui")}</h2>
      ${slip}
    </div>
    <div class="card">
      <h2>${L("3. Which staking style is best", "3. Kuris statymo būdas geriausias")}</h2>
      <p class="note" style="margin-top:0">${L(`${SIM_BETS} bets like the ones on the ticket, replayed ${SIM_RUNS.toLocaleString("en")} times.
        Each bar runs from a bad run (1 in 10) to a good run (1 in 10); the dot is the typical result. Blue: the model's
        chances are right. Orange: the bookmaker's are, and the model has no edge.`,
        `${SIM_BETS} statymų, panašių į bilieto statymus, pakartota ${SIM_RUNS.toLocaleString("lt")} kartų. Kiekviena juosta
        rodo nuo nesėkmingo atvejo (1 iš 10) iki sėkmingo (1 iš 10); taškas yra įprastas rezultatas. Mėlyna: teisios modelio
        tikimybės. Oranžinė: teisi lažybų bendrovė, o modelis pranašumo neturi.`)}</p>
      ${styleChart(bank)}
      ${styleTable(bank)}
      <p class="note">${L(`What it shows: the cautious style loses little if the model is wrong and still grows if it is right.
        Bigger stakes only help when the model really has an edge, which is not proven yet; if it has none they lose money
        faster. Chasing 4x usually ends near zero either way. Nobody knows in advance which colour is true, so pick the
        style whose orange bar you can live with.`,
        `Ką tai rodo: atsargus būdas mažai praranda, jei modelis klysta, ir vis tiek auga, jei jis teisus. Didesnės sumos
        padeda tik tada, kai modelis tikrai turi pranašumą, o tai dar neįrodyta; jei jo nėra, pinigai prarandami greičiau.
        Vaikantis 4x abiem atvejais dažniausiai lieka beveik nulis. Iš anksto niekas nežino, kuri spalva teisinga, todėl
        rinkitės būdą, kurio oranžinė juosta jums priimtina.`)}</p>
    </div>
    <div class="card note">
      <p style="margin-top:0">${L(`Kelly is a formula for the stake that grows a bankroll fastest when the chances are known exactly.
        They never are, so a quarter of it is the usual safe choice. Bet only money you can afford to lose.
        Help in Lithuania: Lošimų priežiūros tarnyba, tel. 8 800 222 99 (free).`,
        `Kelly yra formulė, kuri parenka sumą, greičiausiai auginančią banką, kai tikimybės žinomos tiksliai. Tiksliai jos
        niekada nežinomos, todėl įprastas saugus pasirinkimas yra ketvirtadalis. Statykite tik tiek, kiek galite sau leisti
        prarasti. Pagalba: Lošimų priežiūros tarnyba, tel. 8 800 222 99 (nemokamai).`)}</p>
    </div></div>`;
};

setup.plan = params => {
  recordPublished();
  const page = document.getElementById("planPage");
  if (!page) return;
  const inp = document.getElementById("pBankroll");
  inp.addEventListener("change", () => {
    if (inp.value === "" || !isFinite(inp.value) || Number(inp.value) < 0) return;
    betSettings.bankroll = Number(inp.value);
    save("bets.settings", betSettings);
    route();
  });
  page.querySelectorAll("[data-style]").forEach(b => b.addEventListener("click", () => {
    const s = STYLES.find(x => x.id === b.dataset.style);
    betSettings.kelly = s.kelly;
    betSettings.maxPct = s.maxPct;
    save("bets.settings", betSettings);
    route();
  }));
  document.getElementById("copySlip")?.addEventListener("click", () => {
    const nr = chosenRound(params);
    const text = slipText(slipRows(upcoming.filter(g => g.round === nr && !started(g))));
    const msg = document.getElementById("slipMsg");
    const done = () => { msg.textContent = L("Copied.", "Nukopijuota."); };
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(done, () => {
      const ta = Object.assign(document.createElement("textarea"), { value: text });
      document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove(); done();
    });
  });
  // chart hover: one tooltip for the bar under the pointer (or focused by touch)
  const chart = page.querySelector(".plan-chart"), tip = chart.querySelector(".chart-tip");
  chart.addEventListener("pointermove", e => {
    const bar = e.target.closest(".bar");
    if (!bar) { tip.hidden = true; return; }
    tip.textContent = bar.dataset.tip;
    tip.hidden = false;
    const box = chart.getBoundingClientRect();
    tip.style.left = Math.min(Math.max(e.clientX - box.left + 12, 0), box.width - tip.offsetWidth) + "px";
    tip.style.top = (e.clientY - box.top + 14) + "px";
  });
  chart.addEventListener("pointerleave", () => { tip.hidden = true; });
};
