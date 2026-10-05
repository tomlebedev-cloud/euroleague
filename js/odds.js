// Bookmaker odds published with the site (winner, overtime included), used when you
// haven't typed your own for a game on the Betting page. Update by hand before each round:
// game code -> { ml: [home, away], hcp: [home line, home, away], tot: [line, over, under] }
const BOOK_ODDS = {
  source: "TopSport",
  taken: "2026-10-05",
  games: {
    // round 4
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
    // round 5 (Partizan – Panathinaikos not offered yet)
    46: { ml: [1.37, 3.10] },  // Fenerbahce – Zalgiris
    41: { ml: [2.03, 1.79] },  // LDLC ASVEL – Crvena Zvezda
    44: { ml: [1.32, 3.45] },  // FC Barcelona – Maccabi
    42: { ml: [2.95, 1.41] },  // Baskonia – Dubai
    43: { ml: [2.50, 1.54] },  // Milan – Real Madrid
    45: { ml: [2.05, 1.78] },  // Valencia – Olympiacos
    48: { ml: [1.40, 2.95] },  // Hapoel TLV – Besiktas
    49: { ml: [1.36, 3.20] },  // Anadolu Efes – Bayern Munich
    50: { ml: [1.45, 2.80] },  // Paris – Virtus Bologna
    // later rounds
    66: { ml: [1.85, 1.85] },  // round 7: Partizan – Crvena Zvezda
    160: { ml: [1.50, 2.40] }, // round 16: Panathinaikos – Olympiacos
  },
};
