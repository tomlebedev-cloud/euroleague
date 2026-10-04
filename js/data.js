// =====================================================================
//  EUROLEAGUE DATA
//  This is SAMPLE data so the site works out of the box. Rosters and
//  numbers are illustrative, not official. Edit this file to update:
//    - TEAMS:  team info + players (per-game averages)
//    - GAMES:  played games have a score, upcoming games have score: null
//  Standings, stat leaders and predictions are all calculated from this.
// =====================================================================

const SEASON = "2026-27";

// Player row format:
// [name, position, nationality, gamesPlayed, minutes, points, rebounds, assists, steals, blocks, PIR]
const TEAMS = [
  { id: "RMB", name: "Real Madrid", city: "Madrid", country: "Spain", color: "#d4af37", players: [
    ["Facundo Campazzo", "G", "ARG", 3, 27.1, 12.3, 2.7, 7.0, 1.7, 0.0, 16.0],
    ["Andres Feliz", "G", "DOM", 3, 22.4, 11.0, 3.3, 3.3, 1.0, 0.0, 11.7],
    ["Mario Hezonja", "F", "CRO", 3, 26.8, 16.7, 5.0, 2.0, 0.7, 0.3, 17.3],
    ["Dzanan Musa", "F", "BIH", 3, 21.0, 10.3, 2.3, 1.3, 0.3, 0.0, 8.7],
    ["Walter Tavares", "C", "CPV", 3, 23.5, 9.7, 7.7, 0.7, 0.3, 2.3, 18.3],
  ]},
  { id: "OLY", name: "Olympiacos", city: "Piraeus", country: "Greece", color: "#c8102e", players: [
    ["Thomas Walkup", "G", "USA", 3, 24.0, 7.3, 3.7, 5.3, 2.0, 0.3, 13.3],
    ["Evan Fournier", "G", "FRA", 3, 25.2, 15.0, 2.3, 2.0, 0.7, 0.0, 12.7],
    ["Sasha Vezenkov", "F", "BUL", 3, 27.3, 18.7, 6.7, 1.3, 1.0, 0.3, 22.0],
    ["Kostas Papanikolaou", "F", "GRE", 3, 18.9, 5.3, 3.3, 1.3, 1.0, 0.3, 6.7],
    ["Nikola Milutinov", "C", "SRB", 3, 21.7, 9.0, 8.3, 1.7, 0.7, 0.7, 17.0],
  ]},
  { id: "PAO", name: "Panathinaikos", city: "Athens", country: "Greece", color: "#007a33", players: [
    ["Kendrick Nunn", "G", "USA", 3, 28.6, 20.3, 3.0, 3.7, 1.3, 0.0, 19.7],
    ["Kostas Sloukas", "G", "GRE", 3, 22.1, 9.3, 2.0, 5.7, 0.7, 0.0, 12.3],
    ["Jerian Grant", "G", "USA", 3, 23.4, 8.7, 2.7, 3.3, 1.3, 0.3, 9.3],
    ["Juancho Hernangomez", "F", "ESP", 3, 20.2, 8.0, 5.3, 1.0, 0.7, 0.3, 9.7],
    ["Mathias Lessort", "C", "FRA", 3, 22.8, 13.3, 6.7, 1.0, 1.0, 1.0, 18.7],
  ]},
  { id: "FEN", name: "Fenerbahce", city: "Istanbul", country: "Turkey", color: "#ffed00", players: [
    ["Wade Baldwin IV", "G", "USA", 3, 25.5, 13.7, 3.3, 5.0, 1.3, 0.3, 14.3],
    ["Tarik Biberovic", "G", "TUR", 3, 21.3, 10.0, 2.7, 1.3, 1.0, 0.3, 9.0],
    ["Nigel Hayes-Davis", "F", "USA", 3, 27.9, 17.3, 4.7, 1.7, 1.0, 0.3, 17.7],
    ["Nicolo Melli", "F", "ITA", 3, 19.4, 6.3, 5.0, 2.3, 0.7, 0.7, 10.3],
    ["Khem Birch", "C", "CAN", 3, 18.6, 7.7, 6.0, 0.7, 0.7, 1.3, 12.0],
  ]},
  { id: "ZAL", name: "Zalgiris", city: "Kaunas", country: "Lithuania", color: "#006a4e", players: [
    ["Lukas Lekavicius", "G", "LTU", 3, 22.7, 11.7, 1.7, 4.7, 0.7, 0.0, 11.3],
    ["Sylvain Francisco", "G", "FRA", 3, 27.4, 15.3, 2.7, 5.7, 1.3, 0.0, 15.7],
    ["Deividas Sirvydis", "F", "LTU", 3, 23.0, 10.3, 3.3, 1.3, 0.7, 0.3, 9.3],
    ["Edgaras Ulanovas", "F", "LTU", 3, 20.6, 7.0, 4.3, 2.0, 1.0, 0.3, 9.7],
    ["Laurynas Birutis", "C", "LTU", 3, 19.8, 10.7, 5.7, 0.7, 0.3, 0.7, 13.0],
  ]},
  { id: "BAR", name: "FC Barcelona", city: "Barcelona", country: "Spain", color: "#a50044", players: [
    ["Kevin Punter", "G", "USA", 3, 26.2, 17.0, 2.3, 2.3, 0.7, 0.0, 13.7],
    ["Juan Nunez", "G", "ESP", 3, 23.1, 8.3, 3.0, 5.3, 1.3, 0.0, 11.0],
    ["Tornike Shengelia", "F", "GEO", 3, 22.5, 12.7, 5.0, 2.7, 1.0, 0.3, 16.3],
    ["Joel Parra", "F", "ESP", 3, 18.0, 6.7, 3.7, 1.0, 0.7, 0.3, 7.0],
    ["Willy Hernangomez", "C", "ESP", 3, 19.7, 11.3, 6.7, 1.0, 0.3, 0.3, 14.3],
  ]},
  { id: "MON", name: "AS Monaco", city: "Monaco", country: "Monaco", color: "#e2001a", players: [
    ["Mike James", "G", "USA", 3, 27.0, 19.7, 3.0, 5.3, 1.0, 0.0, 19.0],
    ["Elie Okobo", "G", "FRA", 3, 22.9, 11.0, 2.3, 3.7, 1.0, 0.3, 10.3],
    ["Matthew Strazel", "G", "FRA", 3, 16.5, 7.3, 1.7, 2.7, 0.7, 0.0, 6.7],
    ["Alpha Diallo", "F", "USA", 3, 25.8, 12.0, 5.7, 2.0, 1.7, 0.3, 14.0],
    ["Daniel Theis", "C", "GER", 3, 20.4, 9.3, 6.3, 1.3, 0.7, 1.0, 13.7],
  ]},
  { id: "EFS", name: "Anadolu Efes", city: "Istanbul", country: "Turkey", color: "#003b7a", players: [
    ["Shane Larkin", "G", "TUR", 3, 26.3, 15.7, 2.7, 4.3, 1.0, 0.0, 14.3],
    ["Darius Thompson", "G", "USA", 3, 24.1, 9.0, 3.3, 5.7, 1.3, 0.3, 12.0],
    ["Rodrigue Beaubois", "G", "FRA", 3, 17.8, 8.7, 1.3, 1.0, 0.7, 0.0, 6.0],
    ["Ercan Osmani", "F", "TUR", 3, 21.6, 9.7, 4.7, 1.3, 0.3, 0.3, 9.7],
    ["Vincent Poirier", "C", "FRA", 3, 20.9, 8.0, 7.3, 0.7, 0.7, 1.0, 13.3],
  ]},
  { id: "MIL", name: "EA7 Emporio Armani Milan", city: "Milan", country: "Italy", color: "#e30613", players: [
    ["Armoni Brooks", "G", "USA", 3, 23.7, 12.3, 2.7, 1.3, 0.7, 0.0, 9.0],
    ["Leandro Bolmaro", "G", "ARG", 3, 22.0, 7.7, 3.3, 3.7, 1.3, 0.3, 9.7],
    ["Shavon Shields", "F", "DEN", 3, 26.5, 15.3, 4.0, 2.3, 1.0, 0.3, 14.7],
    ["Nikola Mirotic", "F", "MNE", 3, 25.1, 17.7, 6.0, 1.3, 1.0, 0.7, 19.3],
    ["Zach LeDay", "F", "USA", 3, 19.2, 8.3, 4.7, 0.7, 0.7, 0.3, 8.7],
  ]},
  { id: "BAY", name: "FC Bayern Munich", city: "Munich", country: "Germany", color: "#dc052d", players: [
    ["Carsen Edwards", "G", "USA", 3, 24.8, 15.0, 2.0, 2.3, 0.7, 0.0, 10.3],
    ["Andreas Obst", "G", "GER", 3, 23.2, 11.3, 1.7, 2.0, 0.7, 0.0, 8.7],
    ["Nick Weiler-Babb", "G", "USA", 3, 21.9, 6.3, 4.0, 3.0, 1.3, 0.3, 9.0],
    ["Vladimir Lucic", "F", "SRB", 3, 20.5, 8.0, 4.3, 1.3, 0.7, 0.3, 8.3],
    ["Oscar da Silva", "F", "GER", 3, 19.6, 9.0, 4.7, 1.0, 0.3, 0.3, 9.3],
  ]},
  { id: "MTA", name: "Maccabi Tel Aviv", city: "Tel Aviv", country: "Israel", color: "#fcd116", players: [
    ["Lorenzo Brown", "G", "ESP", 3, 25.6, 13.7, 3.0, 6.3, 1.3, 0.0, 15.3],
    ["Jimmy Clark III", "G", "USA", 3, 22.3, 11.0, 2.0, 2.3, 1.0, 0.0, 8.7],
    ["Jaylen Hoard", "F", "FRA", 3, 24.4, 14.3, 6.0, 1.0, 0.7, 0.7, 15.0],
    ["Roman Sorkin", "F", "ISR", 3, 18.7, 10.0, 4.3, 0.7, 0.3, 0.7, 10.0],
    ["Josh Nebo", "C", "USA", 3, 21.1, 12.7, 6.7, 0.7, 0.7, 1.7, 17.3],
  ]},
  { id: "HTA", name: "Hapoel Tel Aviv", city: "Tel Aviv", country: "Israel", color: "#e4002b", players: [
    ["Vasilije Micic", "G", "SRB", 3, 27.2, 16.0, 2.7, 6.7, 1.0, 0.0, 18.0],
    ["Elijah Bryant", "G", "USA", 3, 23.8, 12.7, 3.3, 2.3, 1.3, 0.3, 12.0],
    ["Antonio Blakeney", "G", "USA", 3, 20.1, 13.3, 2.0, 1.3, 0.3, 0.0, 9.0],
    ["Johnathan Motley", "F", "USA", 3, 24.0, 15.7, 6.3, 1.3, 0.7, 0.7, 18.7],
    ["Dan Oturu", "C", "USA", 3, 17.3, 7.3, 5.7, 0.3, 0.3, 1.0, 10.3],
  ]},
  { id: "PAR", name: "Partizan", city: "Belgrade", country: "Serbia", color: "#111111", players: [
    ["Carlik Jones", "G", "LBR", 3, 26.9, 14.7, 3.7, 6.0, 1.3, 0.0, 16.7],
    ["Duane Washington Jr", "G", "USA", 3, 21.5, 12.0, 1.7, 1.7, 0.7, 0.0, 7.7],
    ["Sterling Brown", "F", "USA", 3, 22.6, 9.3, 4.3, 1.7, 1.0, 0.3, 10.0],
    ["Isaac Bonga", "F", "GER", 3, 23.0, 8.7, 5.0, 2.3, 1.3, 0.7, 11.7],
    ["Tyrique Jones", "C", "USA", 3, 20.7, 10.3, 7.3, 0.7, 0.7, 1.0, 15.0],
  ]},
  { id: "CZV", name: "Crvena Zvezda", city: "Belgrade", country: "Serbia", color: "#c8102e", players: [
    ["Codi Miller-McIntyre", "G", "BUL", 3, 25.4, 13.3, 3.3, 5.7, 1.3, 0.0, 15.0],
    ["Nemanja Nedovic", "G", "SRB", 3, 21.2, 12.7, 1.7, 3.0, 0.7, 0.0, 10.0],
    ["Ognjen Dobric", "F", "SRB", 3, 22.8, 9.0, 3.0, 1.3, 1.0, 0.3, 8.3],
    ["Joel Bolomboy", "F", "RUS", 3, 21.9, 10.7, 6.3, 1.0, 0.7, 1.0, 14.3],
    ["Ebuka Izundu", "C", "NGR", 3, 17.5, 8.3, 5.7, 0.3, 0.3, 1.0, 10.7],
  ]},
  { id: "VAL", name: "Valencia Basket", city: "Valencia", country: "Spain", color: "#f28c00", players: [
    ["Jean Montero", "G", "DOM", 3, 25.3, 16.3, 2.7, 4.0, 1.0, 0.0, 14.7],
    ["Chris Jones", "G", "USA", 3, 23.0, 9.3, 2.7, 5.0, 1.3, 0.0, 11.0],
    ["Josep Puerto", "F", "ESP", 3, 20.6, 8.3, 3.7, 1.3, 1.0, 0.3, 8.7],
    ["Jaime Pradilla", "F", "ESP", 3, 19.8, 9.0, 4.7, 1.0, 0.7, 0.3, 9.7],
    ["Neal Sako", "C", "FRA", 3, 18.1, 7.7, 6.0, 0.7, 0.3, 1.0, 11.0],
  ]},
  { id: "BKN", name: "Baskonia", city: "Vitoria-Gasteiz", country: "Spain", color: "#1d428a", players: [
    ["Trent Forrest", "G", "USA", 3, 24.5, 10.7, 4.0, 5.3, 1.7, 0.3, 13.0],
    ["Timothe Luwawu-Cabarrot", "F", "FRA", 3, 25.7, 14.0, 3.7, 1.3, 1.0, 0.3, 10.7],
    ["Tadas Sedekerskis", "F", "LTU", 3, 22.4, 9.7, 5.3, 2.0, 0.7, 0.3, 11.3],
    ["Luka Samanic", "F", "CRO", 3, 20.0, 10.3, 4.3, 1.0, 0.3, 0.7, 9.7],
    ["Khalifa Diop", "C", "SEN", 3, 19.3, 8.0, 6.3, 0.7, 0.3, 1.3, 11.7],
  ]},
  { id: "VIR", name: "Virtus Bologna", city: "Bologna", country: "Italy", color: "#231f20", players: [
    ["Alessandro Pajola", "G", "ITA", 3, 22.6, 5.7, 3.0, 4.7, 1.7, 0.0, 9.0],
    ["Matt Morgan", "G", "USA", 3, 24.3, 14.0, 2.0, 2.3, 0.7, 0.0, 9.7],
    ["Marco Belinelli", "G", "ITA", 3, 19.5, 11.3, 1.3, 1.3, 0.3, 0.0, 7.0],
    ["Isaia Cordinier", "G", "FRA", 3, 23.7, 10.0, 3.7, 2.3, 1.0, 0.3, 10.3],
    ["Momo Diouf", "C", "SEN", 3, 18.4, 8.7, 6.0, 0.7, 0.3, 1.0, 11.3],
  ]},
  { id: "ASV", name: "LDLC ASVEL", city: "Villeurbanne", country: "France", color: "#00843d", players: [
    ["Nando De Colo", "G", "FRA", 3, 21.8, 11.7, 2.3, 3.7, 1.0, 0.0, 11.3],
    ["Paris Lee", "G", "USA", 3, 23.5, 8.3, 2.7, 4.3, 1.3, 0.0, 8.7],
    ["Theo Maledon", "G", "FRA", 3, 24.6, 13.0, 3.3, 3.3, 0.7, 0.3, 10.0],
    ["David Lighty", "F", "USA", 3, 17.2, 5.3, 3.0, 1.0, 0.7, 0.3, 5.3],
    ["Youssoupha Fall", "C", "FRA", 3, 18.9, 7.7, 6.7, 0.3, 0.3, 1.7, 11.3],
  ]},
  { id: "PRS", name: "Paris Basketball", city: "Paris", country: "France", color: "#0b1f3a", players: [
    ["TJ Shorts", "G", "MKD", 3, 27.5, 17.7, 3.0, 6.7, 1.7, 0.0, 19.3],
    ["Nadir Hifi", "G", "FRA", 3, 24.2, 15.3, 2.0, 2.3, 1.0, 0.0, 11.0],
    ["Derek Willis", "F", "USA", 3, 21.3, 9.7, 5.0, 1.0, 0.7, 0.7, 10.7],
    ["Mikael Jantunen", "F", "FIN", 3, 20.8, 8.3, 4.7, 1.7, 0.7, 0.3, 9.3],
    ["Leopold Cavaliere", "F", "FRA", 3, 17.6, 7.0, 5.3, 0.7, 0.3, 0.7, 8.7],
  ]},
  { id: "DUB", name: "Dubai Basketball", city: "Dubai", country: "UAE", color: "#00205b", players: [
    ["Klemen Prepelic", "G", "SLO", 3, 23.9, 14.0, 2.0, 2.3, 0.7, 0.0, 9.7],
    ["Aleksa Avramovic", "G", "SRB", 3, 22.4, 9.7, 2.7, 3.7, 1.3, 0.0, 9.3],
    ["Dwayne Bacon", "G", "USA", 3, 24.7, 15.0, 3.7, 1.7, 1.0, 0.3, 11.3],
    ["Davis Bertans", "F", "LAT", 3, 19.0, 10.0, 3.3, 0.7, 0.3, 0.3, 7.7],
    ["Filip Petrusev", "C", "SRB", 3, 23.1, 14.7, 6.7, 1.3, 0.7, 0.7, 17.0],
  ]},
];

// Games: round, date (YYYY-MM-DD), home team id, away team id,
// score: [home, away] for played games, null for upcoming.
const GAMES = [
  // ---- Round 1 ----
  { round: 1, date: "2026-09-24", home: "RMB", away: "ZAL", score: [88, 81] },
  { round: 1, date: "2026-09-24", home: "OLY", away: "BAY", score: [92, 78] },
  { round: 1, date: "2026-09-24", home: "PAO", away: "ASV", score: [85, 74] },
  { round: 1, date: "2026-09-24", home: "FEN", away: "DUB", score: [90, 84] },
  { round: 1, date: "2026-09-24", home: "BAR", away: "MIL", score: [79, 83] },
  { round: 1, date: "2026-09-25", home: "MON", away: "CZV", score: [95, 89] },
  { round: 1, date: "2026-09-25", home: "EFS", away: "PRS", score: [81, 86] },
  { round: 1, date: "2026-09-25", home: "MTA", away: "VIR", score: [98, 91] },
  { round: 1, date: "2026-09-25", home: "HTA", away: "VAL", score: [84, 80] },
  { round: 1, date: "2026-09-25", home: "PAR", away: "BKN", score: [87, 77] },
  // ---- Round 2 ----
  { round: 2, date: "2026-09-30", home: "ZAL", away: "OLY", score: [79, 76] },
  { round: 2, date: "2026-09-30", home: "BAY", away: "PAO", score: [80, 88] },
  { round: 2, date: "2026-09-30", home: "ASV", away: "FEN", score: [72, 91] },
  { round: 2, date: "2026-09-30", home: "DUB", away: "BAR", score: [85, 82] },
  { round: 2, date: "2026-09-30", home: "MIL", away: "RMB", score: [77, 84] },
  { round: 2, date: "2026-10-01", home: "CZV", away: "EFS", score: [88, 80] },
  { round: 2, date: "2026-10-01", home: "PRS", away: "MTA", score: [94, 90] },
  { round: 2, date: "2026-10-01", home: "VIR", away: "HTA", score: [76, 89] },
  { round: 2, date: "2026-10-01", home: "VAL", away: "PAR", score: [86, 83] },
  { round: 2, date: "2026-10-01", home: "BKN", away: "MON", score: [81, 93] },
  // ---- Round 3 ----
  { round: 3, date: "2026-10-02", home: "RMB", away: "OLY", score: [82, 80] },
  { round: 3, date: "2026-10-02", home: "PAO", away: "ZAL", score: [90, 78] },
  { round: 3, date: "2026-10-02", home: "FEN", away: "BAY", score: [87, 79] },
  { round: 3, date: "2026-10-02", home: "BAR", away: "ASV", score: [91, 70] },
  { round: 3, date: "2026-10-02", home: "MON", away: "DUB", score: [88, 86] },
  { round: 3, date: "2026-10-03", home: "EFS", away: "MIL", score: [84, 82] },
  { round: 3, date: "2026-10-03", home: "MTA", away: "CZV", score: [89, 92] },
  { round: 3, date: "2026-10-03", home: "HTA", away: "PRS", score: [91, 85] },
  { round: 3, date: "2026-10-03", home: "PAR", away: "VIR", score: [80, 74] },
  { round: 3, date: "2026-10-03", home: "VAL", away: "BKN", score: [83, 79] },
  // ---- Round 4 (upcoming) ----
  { round: 4, date: "2026-10-07", home: "OLY", away: "PAO", score: null },
  { round: 4, date: "2026-10-07", home: "ZAL", away: "FEN", score: null },
  { round: 4, date: "2026-10-07", home: "BAY", away: "RMB", score: null },
  { round: 4, date: "2026-10-07", home: "ASV", away: "MON", score: null },
  { round: 4, date: "2026-10-07", home: "DUB", away: "EFS", score: null },
  { round: 4, date: "2026-10-08", home: "MIL", away: "MTA", score: null },
  { round: 4, date: "2026-10-08", home: "CZV", away: "HTA", score: null },
  { round: 4, date: "2026-10-08", home: "PRS", away: "PAR", score: null },
  { round: 4, date: "2026-10-08", home: "VIR", away: "VAL", score: null },
  { round: 4, date: "2026-10-08", home: "BKN", away: "BAR", score: null },
  // ---- Round 5 (upcoming) ----
  { round: 5, date: "2026-10-09", home: "RMB", away: "PAO", score: null },
  { round: 5, date: "2026-10-09", home: "FEN", away: "OLY", score: null },
  { round: 5, date: "2026-10-09", home: "ZAL", away: "BAR", score: null },
  { round: 5, date: "2026-10-09", home: "MON", away: "BAY", score: null },
  { round: 5, date: "2026-10-09", home: "EFS", away: "ASV", score: null },
  { round: 5, date: "2026-10-10", home: "MTA", away: "DUB", score: null },
  { round: 5, date: "2026-10-10", home: "HTA", away: "MIL", score: null },
  { round: 5, date: "2026-10-10", home: "PAR", away: "CZV", score: null },
  { round: 5, date: "2026-10-10", home: "VAL", away: "PRS", score: null },
  { round: 5, date: "2026-10-10", home: "BKN", away: "VIR", score: null },
];
