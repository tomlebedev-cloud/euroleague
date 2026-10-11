// Bookmaker odds published with the site (winner, overtime included), used when you
// haven't typed your own for a game on the Betting page. Update by hand before each round:
// game code -> { ml: [home, away], hcp: [home line, home, away], tot: [line, over, under] }
const BOOK_ODDS = {
  source: "TopSport",
  taken: "2026-10-11",
  games: {
    // round 4 (taken 2026-10-05)
    31: { ml: [1.42, 2.90] },  // Paris – LDLC ASVEL
    37: { ml: [1.35, 3.25] },  // Dubai – Crvena Zvezda
    32: { ml: [1.84, 1.97] },  // Maccabi – Milan
    33: { ml: [1.42, 2.90] },  // Bayern Munich – Virtus Bologna
    36: { ml: [1.53, 2.55] },  // Panathinaikos – Fenerbahce
    34: { ml: [1.96, 1.86] },  // Valencia – Hapoel TLV
    35: { ml: [1.19, 4.70] },  // Real Madrid – Partizan
    40: { ml: [1.17, 5.00] },  // Olympiacos – Anadolu Efes
    39: { ml: [1.68, 2.19] },  // FC Barcelona – Zalgiris
    38: { ml: [1.69, 2.18] },  // Baskonia – Besiktas
    // round 5 (taken 2026-10-11)
    46: { ml: [1.31, 3.45] },  // Fenerbahce – Zalgiris
    41: { ml: [2.04, 1.79] },  // LDLC ASVEL – Crvena Zvezda
    47: { ml: [2.35, 1.60] },  // Partizan – Panathinaikos
    44: { ml: [1.35, 3.25] },  // FC Barcelona – Maccabi
    43: { ml: [2.60, 1.50] },  // Milan – Real Madrid
    42: { ml: [2.90, 1.42] },  // Baskonia – Dubai
    45: { ml: [2.18, 1.69] },  // Valencia – Olympiacos
    48: { ml: [1.35, 3.25] },  // Hapoel TLV – Besiktas
    49: { ml: [1.34, 3.25] },  // Anadolu Efes – Bayern Munich
    50: { ml: [1.41, 2.90] },  // Paris – Virtus Bologna
    // round 6 (taken 2026-10-11; Fenerbahce – Partizan not offered yet)
    52: { ml: [1.41, 2.95] },  // Valencia – Maccabi
    51: { ml: [2.05, 1.78] },  // Milan – Dubai
    53: { ml: [1.10, 7.20] },  // Real Madrid – LDLC ASVEL
    57: { ml: [1.40, 2.95] },  // Zalgiris – Anadolu Efes
    55: { ml: [1.60, 2.35] },  // Besiktas – Bayern Munich
    56: { ml: [1.29, 3.60] },  // Crvena Zvezda – Paris
    60: { ml: [1.38, 3.05] },  // Panathinaikos – Hapoel TLV
    59: { ml: [1.61, 2.33] },  // Virtus Bologna – Baskonia
    58: { ml: [2.34, 1.61] },  // FC Barcelona – Olympiacos
    // later rounds
    66: { ml: [1.85, 1.85] },  // round 7: Partizan – Crvena Zvezda
    160: { ml: [1.50, 2.40] }, // round 16: Panathinaikos – Olympiacos
  },
};
