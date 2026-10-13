// Every game in Lingo. The home screen shows one card per entry and App
// creates its routes. See ./README.md for how to add a game.
import HangmanSetup from "./hangman/HangmanSetup";
import HangmanGame from "./hangman/HangmanGame";
import MeaningGame from "./meaning/MeaningGame";
import PhraseGame from "./phrase/PhraseGame";
import ListeningGame from "./listening/ListeningGame";
import { GrammarGame, MixedUpGame } from "./gap/GapGames";
import SoundsGame from "./sounds/SoundsGame";

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
    id: "grammar",
    name: "Grammar check",
    nameFi: "Kielioppitreeni",
    description: "a or an, in or on, he or she: pick the word that fits.",
    art: "a · an · the",
    minutes: 4,
    skill: "Grammar",
    path: "/grammar",
    routes: [{ path: "/grammar", Component: GrammarGame }],
  },
  {
    id: "mixed-up",
    name: "Mixed-up words",
    nameFi: "Sekoittuvat sanat",
    description: "Borrow or lend? Make or do? Pick the right word for each sentence.",
    art: "borrow · lend",
    minutes: 4,
    skill: "Vocabulary",
    path: "/mixed-up",
    routes: [{ path: "/mixed-up", Component: MixedUpGame }],
  },
  {
    id: "sounds",
    name: "Sounds of English",
    nameFi: "Englannin äänteet",
    description: "Silent letters, tricky letters and letter names: hear the rule, then practise.",
    art: "knife · naif",
    minutes: 4,
    skill: "Pronunciation",
    path: "/sounds",
    routes: [{ path: "/sounds", Component: SoundsGame }],
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
