# Adding a game

Every game is a folder under `src/games/` plus one entry in `registry.js`. The
home screen draws a card for each entry and `App.jsx` creates its routes, so a
new game needs no other wiring.

## 1. Register it

```js
// src/games/registry.js
import WordPairsGame from "./word-pairs/WordPairsGame";

{
  id: "word-pairs",              // stable id, stored in progress
  name: "Word Pairs",            // English name (GameCard heading)
  nameFi: "Yhdistä parit",       // Finnish name (GameCard helper line)
  description: "Match each English word with its Finnish meaning.",
  art: "cat · kissa",            // typographic card art: real letters, no emoji
  minutes: 3,
  skill: "Vocabulary",           // Vocabulary, Spelling, Sentences, Listening, Grammar or Pronunciation
  path: "/word-pairs",           // where the card links to
  routes: [{ path: "/word-pairs", Component: WordPairsGame }],
}
```

Replace the matching `soon: true` placeholder if there is one. An entry with
`soon: true` shows as a dashed "Coming later" card and has no routes.

## 2. Get words

`src/lib/words.js` is shared by every game:

- `loadWordSet(searchParams, { count })` reads a `?words=...` link (the same
  format hangman shares) or picks `count` random built-in words. Returns
  `{ pairs: [{ learning, native }], learningLang, nativeLang, swap, fromLink }`.
- `pickCommonWords({ count, include, exclude, learningLang, nativeLang })` and
  `filterCommonWords(...)` give built-in pairs by category (`ALL_CATEGORIES`,
  `DEFAULT_CATEGORIES`).
- `buildWordsQuery({ pairs, learningLang, nativeLang, swap })` makes a
  shareable query string; `encodeWords` / `decodeWords` are the raw format.
- `shuffle`, `getAlphabet(lang)`, `languageLabel(code)`, `categoryLabel(cat, uiLang)`.

The built-in words come from the word bank in `content/` (format and admin
editing: the [lingo-wordbase](https://github.com/amahlaka/lingo-wordbase)
README; `npm run content:pull` downloads it). Besides word pairs it has:

- `getGapItems({ topic, include, exclude, lang })`: fill-the-gap sentences,
  each with one `___`, `answers`, `distractors`, a Finnish `translation`, an
  optional `explanation` and the `topic` it practises.
- `getTopics("rule" | "confusable")` and `getItem(id)`: grammar rules and
  sets of mixed-up words, with titles and explanations in English and Finnish.
- `getWordGroups()`: sets of small words that are easy to confuse
  (is / are / am …), for believable wrong options.
- `getSoundLessons()`: pronunciation lessons (silent letters, letters with
  more than one sound, letter names), each a rule in English and Finnish and
  its words, with `[ ]` around the letters the rule is about (`[k]nife`).
- `getSentences({ learningLang, nativeLang })`: every whole sentence in the
  bank (phrases, example sentences, filled-in gap sentences) as pairs.

Content can change after a release, so look items up by `id` and don't
hard-code words in a game.

## 3. Report progress

Call `recordWord` once for every finished word or item. Points, the daily goal,
streaks, learned words and achievements all update from it.

```js
import { useProgress } from "../../app/ProgressContext";

const { recordWord } = useProgress();

const events = recordWord({
  gameId: "word-pairs",
  word: "cat",          // the English word practised
  lang: "en-GB",        // language of `word`
  solved: true,         // false for a missed item (still earns 2 XP)
  triesLeft: 2,         // +2 XP each; use 0 if your game has no tries
  perfect: true,        // first try, no miss: +5 XP
});
// events: { xpGained, levelUp, goalReached, streakChange, newAchievements,
//           wordLearned, wordStreak, wordStreakMilestone }
```

Use `events` to pick the celebration size (see below). The rules themselves
live in `src/lib/progress.js` as pure functions, with tests in
`src/__tests__/progress.test.js`.

`useProgress()` also gives `xp`, `level`, `streak`, `today`, `dailyGoal`,
`learnedWords` and `wordStreak` for display. `useSettings()`
(`src/app/SettingsContext.jsx`) gives `lang` ("en" or "fi"), `t` (strings from
`src/i18n.js`; use `fill(t.key, { n })` for placeholders) and the theme.

## 4. Build the screen

Import building blocks from `src/components/lingo`:

- `GameScreen` – the frame: back to games, title, streak and goal ring, your
  `score` element, settings menu (`menuActions` for e.g. Restart). Put the
  board in a `<main className="lg-board">` and, if the game has a keyboard or
  answer buttons, a `<div className="lg-tray">` after it (sticks to the bottom).
- `Feedback` – result banners: `variant="correct" | "retry" | "info" | "streak"`,
  `title`, body as children, optional Finnish `fi` helper line.
- `useConfetti()` – `const { celebrate, confetti } = useConfetti()`; render
  `{confetti}` inside a `position: relative` element and call
  `celebrate("medium")` for a solved item or `celebrate("large")` when
  `events.goalReached`, `events.levelUp` or `events.wordStreakMilestone`.
- `WordTiles`, `TriesMeter`, `ScorePill`, `CategoryChips`, `DailyProgress`,
  `Achievements`.

Styling uses the `lg-` classes from `src/styles/lingo.css` (copied from the
Lingo design system) and tokens from `src/styles/tokens.css`. Put game-specific
layout in `src/styles/app.css` under a short prefix (hangman uses `hm-`), and
use only token variables for colour.

Copy rules from the design system: sentence case, calm and specific words,
"Not this time" instead of "Wrong", no red, no emoji, one primary button per
screen.

## Question-by-question games

For a game made of short questions (pick one, put in order …),
`src/games/practice/PracticeSession.jsx` already does the round for you: the
header and points, progress dots, `recordWord`, celebrations and banners, the
Next button and the end screen. Render one question in `renderQuestion` and
call `onDone({ solved, firstTry, tries, triesLeft, answer, meaning })`.
`practiceLogic.js` has `practicePool(params)` (a shared link or every built-in
word), distractor picking and the phrase helpers. Pick the meaning, Build the
phrase, Listen and choose, Fill the Gap and the gap games below are built this way.

A question that holds several words, like a Word Pairs board, gets `onItem` as
well: call `onItem(outcome)` for each word as it is finished (it records the
word and plays the sound), then `onDone({ board: true })` when the whole
question is done. The session shows one "All pairs found" banner for it.

Fill the Gap mixes the word bank's everyday gap sentences (`getGapItems` items
without a `topic`; topic sentences belong to the gap games below) with every
other sentence in it (`getSentences`), gapped automatically. For an
automatic gap that is a small grammar word (is/are, a/the, in/at …) the other
options come from the same word group (`getWordGroups`), so adding a group or
words to one in the word bank widens it.

## Gap games

Grammar check and Mixed-up words (`src/games/gap/`) are one game over two kinds
of word bank topic: `getTopics("rule")` for grammar and `getTopics("confusable")`
for mixed-up words, each with the `getGapItems()` sentences that point at it.
The sentences live in the lingo-wordbase repository (`packs/grammar.json` and
`packs/mixed-up-words.json`), so adding sentences or a whole new topic needs no
app change. `?set=<topic id>` practises one topic, e.g.
`/mixed-up?set=borrow-lend`.

## Speech

`src/lib/speech.js` wraps the browser's speech synthesis for every game that
reads words aloud: `canSpeak()`, `speak(text, { lang, rate })` (`RATE_SLOW`
for "Slowly") and `stopSpeaking()`. Check `canSpeak()` and keep the game
usable, or explain, when the browser has no voices.

## Sounds of English

`src/games/sounds/` teaches pronunciation from the word bank's `sound` items
(`packs/pronunciation.json` in lingo-wordbase). `/sounds` lists the lessons,
`?set=<id>` shows one lesson's rule and words to listen to, `&practise=1`
practises them and `?set=mix` mixes every lesson. The four question kinds
(tap the silent letter, pick the sound, pick which of two sound-alike words
you heard, pick the letter you heard) are in
`soundsLogic.js` and `SoundQuestion.jsx`.
