// Every game in Lingo. The home screen shows one card per entry and App
// creates its routes. See ./README.md for how to add a game.
import HangmanCustomWords from "./hangman/HangmanCustomWords";
import HangmanGame from "./hangman/HangmanGame";
import MeaningGame from "./meaning/MeaningGame";
import PhraseGame from "./phrase/PhraseGame";
import SentenceRules from "./phrase/SentenceRules";
import ListeningGame from "./listening/ListeningGame";
import WordPairsGame from "./word-pairs/WordPairsGame";
import FillGapGame from "./fill-gap/FillGapGame";
import { GrammarGame, MixedUpGame } from "./gap/GapGames";
import SayGame from "./say/SayGame";
import TypeGame from "./type/TypeGame";
import SoundsGame from "./sounds/SoundsGame";
import QuickPlay from "./quick/QuickPlay";
import TalkGame from "./talk/TalkGame";
import MistakeGame from "./mistake/MistakeGame";
import RushGame from "./rush/RushGame";
import DailyGame from "./daily/DailyGame";
import ReadGame from "./read/ReadGame";

export const GAMES = [
  {
    // Shown above the game cards. It asks questions from the other games and
    // records them under those games, so it isn't a game of its own for
    // progress or the Explorer badge.
    id: "quick-play",
    featured: true,
    name: "Quick play",
    nameFi: "Pikapeli",
    description: "A mix of games picked for you: a few easy wins and a few challenges.",
    art: "mix",
    minutes: 4,
    skill: "Mixed",
    path: "/quick",
    routes: [{ path: "/quick", Component: QuickPlay }],
  },
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
      // Straight into a game with words from the word bank.
      { path: "/hangman", Component: HangmanGame },
      { path: "/hangman/words", Component: HangmanCustomWords },
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
    routes: [
      { path: "/phrase", Component: PhraseGame },
      // How English sentences are built (subject, verb, object …).
      { path: "/phrase/rules", Component: SentenceRules },
    ],
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
    id: "say",
    name: "Say it",
    nameFi: "Sano se",
    description: "Hear an English word, then say it into your microphone.",
    art: "/θriː/",
    minutes: 4,
    skill: "Speaking",
    path: "/say",
    routes: [{ path: "/say", Component: SayGame }],
  },
  {
    id: "type-it",
    name: "Type it",
    nameFi: "Kirjoita se",
    description: "Type the English for a Finnish word, and write down sentences you hear.",
    art: "k_tchen",
    minutes: 4,
    skill: "Spelling",
    path: "/type-it",
    routes: [{ path: "/type-it", Component: TypeGame }],
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
    description: "Silent letters, tricky letters and letter names: hear the rule, then practice.",
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
  {
    id: "talk",
    name: "Your turn",
    nameFi: "Sinun vuorosi",
    description: "Everyday conversations: you play one person and pick what to say next.",
    art: "Hi! · Hello.",
    minutes: 4,
    skill: "Conversation",
    path: "/talk",
    routes: [{ path: "/talk", Component: TalkGame }],
  },
  {
    id: "spot-mistake",
    name: "Spot the mistake",
    nameFi: "Löydä virhe",
    description: "Each sentence has one typical mistake. Find it, then fix it.",
    art: "he go → goes",
    minutes: 4,
    skill: "Grammar",
    path: "/spot-the-mistake",
    routes: [{ path: "/spot-the-mistake", Component: MistakeGame }],
  },
  {
    id: "rush",
    name: "Word rush",
    nameFi: "Sanakiire",
    description: "One minute, as many words as you can. Answers in a row score more.",
    art: "×3",
    minutes: 1,
    skill: "Vocabulary",
    path: "/word-rush",
    routes: [{ path: "/word-rush", Component: RushGame }],
  },
  {
    id: "daily",
    name: "Daily word",
    nameFi: "Päivän sana",
    description: "One new five-letter word every day. Guess it in six tries from its Finnish meaning.",
    art: "W O R D",
    minutes: 3,
    skill: "Spelling",
    path: "/daily",
    // Played once a day, so My path doesn't plan steps of it.
    noPath: true,
    routes: [{ path: "/daily", Component: DailyGame }],
  },
  {
    id: "read",
    name: "Read and understand",
    nameFi: "Lue ja ymmärrä",
    description: "Short messages, notices and stories with a few easy questions. Tap a sentence for Finnish.",
    art: "Dear Anna,",
    minutes: 5,
    skill: "Reading",
    path: "/read",
    routes: [{ path: "/read", Component: ReadGame }],
  },
];

export const PLAYABLE_GAME_IDS = GAMES.filter((g) => !g.soon && !g.featured).map((g) => g.id);
