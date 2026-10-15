// Bookmaker odds published with the site (winner, overtime included), used when you
// haven't typed your own for a game on the Betting page. Update by hand before each round:
// game code -> { ml: [home, away], hcp: [home line, home, away], tot: [line, over, under] }
const BOOK_ODDS = {
  source: "TopSport",
  taken: "2026-10-15",
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
    // round 5 (taken 2026-10-13, morning of the first games)
    46: { ml: [1.37, 3.15] },  // Fenerbahce – Zalgiris
    41: { ml: [2.21, 1.67] },  // LDLC ASVEL – Crvena Zvezda
    47: { ml: [3.20, 1.36] },  // Partizan – Panathinaikos
    44: { ml: [1.39, 3.05] },  // FC Barcelona – Maccabi
    43: { ml: [2.60, 1.50] },  // Milan – Real Madrid
    42: { ml: [2.85, 1.43] },  // Baskonia – Dubai
    45: { ml: [2.21, 1.68] },  // Valencia – Olympiacos
    48: { ml: [1.32, 3.40] },  // Hapoel TLV – Besiktas
    49: { ml: [1.34, 3.25] },  // Anadolu Efes – Bayern Munich
    50: { ml: [1.49, 2.65] },  // Paris – Virtus Bologna
    // round 6 (taken 2026-10-15, morning of the first games)
    54: { ml: [1.15, 6.20] },  // Fenerbahce – Partizan
    52: { ml: [1.30, 3.80] },  // Valencia – Maccabi
    51: { ml: [2.18, 1.75] },  // Milan – Dubai
    53: { ml: [1.10, 7.00] },  // Real Madrid – LDLC ASVEL
    57: { ml: [1.35, 3.20] },  // Zalgiris – Anadolu Efes
    55: { ml: [1.56, 2.43] },  // Besiktas – Bayern Munich
    56: { ml: [1.28, 3.75] },  // Crvena Zvezda – Paris
    60: { ml: [1.26, 3.95] },  // Panathinaikos – Hapoel TLV
    59: { ml: [1.59, 2.37] },  // Virtus Bologna – Baskonia
    58: { ml: [2.38, 1.59] },  // FC Barcelona – Olympiacos
    // round 7 (taken 2026-10-15; Zalgiris – ASVEL, Olympiacos – Fenerbahce, Paris – Valencia not offered yet)
    61: { ml: [1.25, 4.00] },  // Hapoel TLV – Virtus Bologna
    64: { ml: [1.51, 2.60] },  // Anadolu Efes – Besiktas
    65: { ml: [2.34, 1.60] },  // Bayern Munich – Dubai
    62: { ml: [2.85, 1.43] },  // Maccabi – Real Madrid
    67: { ml: [1.09, 7.80] },  // Panathinaikos – Baskonia
    63: { ml: [1.61, 2.34] },  // Milan – FC Barcelona
    66: { ml: [1.52, 2.55] },  // Partizan – Crvena Zvezda
    // later rounds
    160: { ml: [1.50, 2.40] }, // round 16: Panathinaikos – Olympiacos
  },
};
