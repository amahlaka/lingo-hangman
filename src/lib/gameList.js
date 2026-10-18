// The games by their plain fields (id, names, skill and where they open), for
// the API's AI tools: a copy of src/games/registry.js, which imports the
// games' React components, so the API can't load it. Copied into the API's
// image; src/__tests__/gameList.test.js keeps it equal to the registry.

export const GAME_LIST = [
  { id: "quick-play", name: "Quick play", nameFi: "Pikapeli", skill: "Mixed", path: "/quick", featured: true },
  { id: "hangman", name: "Word Hangman", nameFi: "Hirsipuu", skill: "Vocabulary", path: "/hangman" },
  { id: "meaning", name: "Pick the meaning", nameFi: "Valitse merkitys", skill: "Vocabulary", path: "/meaning" },
  { id: "phrase", name: "Build the phrase", nameFi: "Rakenna lause", skill: "Sentences", path: "/phrase" },
  { id: "listening", name: "Listen and choose", nameFi: "Kuuntele ja valitse", skill: "Listening", path: "/listening" },
  { id: "say", name: "Say it", nameFi: "Sano se", skill: "Speaking", path: "/say" },
  { id: "say-right", name: "Say it right", nameFi: "Sano se oikein", skill: "Pronunciation", path: "/say-right", noPath: true },
  { id: "type-it", name: "Type it", nameFi: "Kirjoita se", skill: "Spelling", path: "/type-it" },
  { id: "grammar", name: "Grammar check", nameFi: "Kielioppitreeni", skill: "Grammar", path: "/grammar" },
  { id: "mixed-up", name: "Mixed-up words", nameFi: "Sekoittuvat sanat", skill: "Vocabulary", path: "/mixed-up" },
  { id: "sounds", name: "Sounds of English", nameFi: "Englannin äänteet", skill: "Pronunciation", path: "/sounds" },
  { id: "word-pairs", name: "Word Pairs", nameFi: "Yhdistä parit", skill: "Vocabulary", path: "/word-pairs" },
  { id: "fill-the-gap", name: "Fill the Gap", nameFi: "Täydennä lause", skill: "Sentences", path: "/fill-the-gap" },
  { id: "talk", name: "Your turn", nameFi: "Sinun vuorosi", skill: "Conversation", path: "/talk" },
  { id: "spot-mistake", name: "Spot the mistake", nameFi: "Löydä virhe", skill: "Grammar", path: "/spot-the-mistake" },
  { id: "rush", name: "Word rush", nameFi: "Sanakiire", skill: "Vocabulary", path: "/word-rush" },
  { id: "daily", name: "Daily word", nameFi: "Päivän sana", skill: "Spelling", path: "/daily", noPath: true },
  { id: "read", name: "Read and understand", nameFi: "Lue ja ymmärrä", skill: "Reading", path: "/read" },
];
