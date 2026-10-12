// Every game in Lingo. The home screen shows one card per entry and App
// creates its routes. See ./README.md for how to add a game.
import HangmanSetup from "./hangman/HangmanSetup";
import HangmanGame from "./hangman/HangmanGame";
import MeaningGame from "./meaning/MeaningGame";
import PhraseGame from "./phrase/PhraseGame";
import ListeningGame from "./listening/ListeningGame";
import WordPairsGame from "./word-pairs/WordPairsGame";
import FillGapGame from "./fill-gap/FillGapGame";

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
    id: "meaning",
    name: "Pick the meaning",
    nameFi: "Valitse merkitys",
    description: "See a Finnish word and pick its English meaning from four.",
    art: "koira → dog",
    minutes: 3,
    skill: "Vocabulary",
    path: "/meaning",
    routes: [{ path: "/meaning", Component: MeaningGame }],
  },
  {
    id: "phrase",
    name: "Build the phrase",
    nameFi: "Rakenna lause",
    description: "Tap the English words into the right order.",
    art: "you · how · are",
    minutes: 4,
    skill: "Sentences",
    path: "/phrase",
    routes: [{ path: "/phrase", Component: PhraseGame }],
  },
  {
    id: "listening",
    name: "Listen and choose",
    nameFi: "Kuuntele ja valitse",
    description: "Hear an English word and pick the one you heard.",
    art: "/treɪn/",
    minutes: 3,
    skill: "Listening",
    path: "/listening",
    routes: [{ path: "/listening", Component: ListeningGame }],
  },
  {
    id: "word-pairs",
    name: "Word Pairs",
    nameFi: "Yhdistä parit",
    description: "Match each English word with its Finnish meaning.",
    art: "cat · kissa",
    minutes: 3,
    skill: "Vocabulary",
    path: "/word-pairs",
    routes: [{ path: "/word-pairs", Component: WordPairsGame }],
  },
  {
    id: "fill-the-gap",
    name: "Fill the Gap",
    nameFi: "Täydennä lause",
    description: "Choose the missing word in an everyday English sentence.",
    art: "Where ___ it?",
    minutes: 4,
    skill: "Sentences",
    path: "/fill-the-gap",
    routes: [{ path: "/fill-the-gap", Component: FillGapGame }],
  },
];

export const PLAYABLE_GAME_IDS = GAMES.filter((g) => !g.soon).map((g) => g.id);
