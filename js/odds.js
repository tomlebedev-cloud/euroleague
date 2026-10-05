// Bookmaker odds published with the site (winner, overtime included), used when you
// haven't typed your own for a game on the Betting page. Update by hand before each round:
// game code -> { ml: [home, away], hcp: [home line, home, away], tot: [line, over, under] }
const BOOK_ODDS = {
  source: "TopSport",
  taken: "2026-10-05",
  games: {
    31: { ml: [1.42, 2.90] },  // Paris – LDLC ASVEL
    37: { ml: [1.35, 3.25] },  // Dubai – Crvena Zvezda
    32: { ml: [1.84, 1.97] },  // Maccabi – Milan
    33: { ml: [1.42, 2.90] },  // Bayern Munich – Virtus Bologna
    36: { ml: [1.53, 2.55] },  // Panathinaikos – Fenerbahce
    34: { ml: [1.96, 1.86] },  // Valencia – Hapoel TLV
    35: { ml: [1.19, 4.70] },  // Real Madrid – Partizan
    40: { ml: [1.17, 5.00] },  // Olympiacos – Anadolu Efes
    39: { ml: [1.68, 2.10] },  // FC Barcelona – Zalgiris
    38: { ml: [1.69, 2.16] },  // Baskonia – Besiktas
  },
};
