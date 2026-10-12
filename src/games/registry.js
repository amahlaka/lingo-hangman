// Every game in Lingo. The home screen shows one card per entry and App
// creates its routes. See ./README.md for how to add a game.
import HangmanSetup from "./hangman/HangmanSetup";
import HangmanGame from "./hangman/HangmanGame";

export const GAMES = [
  {
    id: "hangman",
    name: "Word Hangman",
    nameFi: "Hirsipuu",
    description: "Guess the English word, one letter at a time.",
    art: "_ P P _ E",
    minutes: 5,
    skill: "Vocabulary",
    path: "/hangman",
    routes: [
      { path: "/hangman", Component: HangmanSetup },
      // `/play?words=...` is the shareable link format; keep it working.
      { path: "/play", Component: HangmanGame },
    ],
  },
  {
    id: "word-pairs",
    name: "Word Pairs",
    nameFi: "Yhdistä parit",
    art: "cat · kissa",
    soon: true,
  },
  {
    id: "fill-the-gap",
    name: "Fill the Gap",
    nameFi: "Täydennä lause",
    art: "I ___ coffee",
    soon: true,
  },
];

export const PLAYABLE_GAME_IDS = GAMES.filter((g) => !g.soon).map((g) => g.id);
