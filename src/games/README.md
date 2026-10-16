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
  skill: "Vocabulary",           // Vocabulary, Spelling, Sentences, Listening, Speaking, Conversation, Reading, Grammar or Pronunciation
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
  bank (phrases, example sentences, sentences of texts, filled-in gap
  sentences) as pairs.
- `getTexts({ kind })`: short texts (dialogues, stories, messages, emails,
  notices, instructions, descriptions) as `sentences` in English and Finnish,
  dialogue lines with a `speaker`, plus optional comprehension `questions`.
  Meant for reading and listening games.

Items can also carry metadata for choosing what to practise: `level` (1-3),
`features` (what they show about English: `th-sound`, `present-perfect`…),
`contexts` (`shopping`, `work`…), `register`, and on words `ipa` and `pos`.
The allowed values are in `src/lib/contentSchema.js`; how to fill them in is
in the wordbase's AUTHORING.md.

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
  lang: "en",           // language of `word`
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
  The Next button, and Play again on the end screen, always go in an
  `lg-tray` (end screen: `lg-tray lg-tray--actions`) so players never have to
  scroll to find the next step. `PracticeSession` already does this for you.
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

Under every question the session shows "Skip this one" and "Report a problem".
Call `useQuestionControls({ skip, reportExtra })` (`practice/questionControls.js`)
on every render: `skip()` should end the question unsolved with the answer
shown, as when the tries run out, and `reportExtra()` may return extra report
context (Say it adds what the microphone heard). Without `skip`, skipping just
moves on to the next question, as a Word Pairs board does.

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

`src/lib/speech.js` reads words aloud for every game that does it:
`canSpeak()`, `speak(text, { lang, rate })` (`RATE_SLOW` for "Slowly") and
`stopSpeaking()`. Check `canSpeak()` and keep the game usable, or explain,
when the browser has no voices.

The games teach US English (`DEFAULT_LEARNING_LANG` "en"). Its texts from the
word base play recorded clips, so every device hears the same voice; anything
else, British English ("en-GB") included, uses the browser's speech synthesis.
The learner picks a woman's or a man's voice under Settings (`VOICES` in
`src/lib/speechClips.js`: Kokoro "Nova" and "Liam").
`spokenTexts()` in `src/lib/speechClips.js` lists what the games can say. A
game that reads a new kind of text aloud adds it there, or that text keeps the
browser voice. The clips are made with the open Kokoro voice model by the
Content publish workflow, only for texts that have none yet, and served from
`/content/audio/<voice folder>/<key>.mp3` with a list per voice in
`/content/audio/index.json`. A new voice, or a new folder name for one, makes
its clips from scratch. After a change to `spokenTexts()` or
the voices, run Content publish by hand with "force" ticked. Single words read
from their US `ipa.en` in the word base, so a word the voice gets wrong on its own
("live" as in "live music") is fixed by its IPA; a clip is only made once, so
after correcting a word's IPA, rename the voice folders to make clips again.
Every text of more than one word also gets a slow word-by-word clip
(`wordsKey()`, played by `speakWords()`), and `ListenMore` adds the "In a
sentence" (a single word: `sentenceFor()` picks a word-base sentence with it)
or "Word by word" button next to Listen and Listen slowly.

To make clips on your own computer: `pip install kokoro-onnx onnx soundfile`,
download `kokoro-v1.0.onnx` and `voices-v1.0.bin` (see the workflow), then
`node scripts/speech-audio.mjs plan`, `python scripts/speech-audio.py
audio-build/todo.json --model <folder>` and `node scripts/speech-audio.mjs
finish`. Copy `audio-build/` to `content/audio/` to hear them in `npm run dev`.

## Sounds of English

`src/games/sounds/` teaches pronunciation from the word bank's `sound` items
(`packs/pronunciation.json` in lingo-wordbase). `/sounds` lists the lessons,
`?set=<id>` shows one lesson's rule and words to listen to, `&practise=1`
practises them and `?set=mix` mixes every lesson. The four question kinds
(tap the silent letter, pick the sound, pick which of two sound-alike words
you heard, pick the letter you heard) are in
`soundsLogic.js` and `SoundQuestion.jsx`.

## Say it (speaking)

`src/games/say/` is a question-by-question game where the learner says the word
into the microphone. `src/lib/speechRecognition.js` wraps the browser's Web
Speech API: `canRecognise()`, `onDeviceStatus(lang)` / `installOnDevice(lang)`
for recognition on the device, and `listenOnce({ lang, onDevice })`, which
resolves to the recogniser's alternatives. Lingo never records or stores audio;
it only compares the text the browser returns. `sayLogic.js` does that
comparison forgivingly (homophones, digits, contractions and extra words are
fine, and a phrase of four or more words may miss one word in four). Where the
browser can't listen (Firefox) or the microphone is blocked, the game falls back
to "say it out loud, then tap I said it". Under the word it always shows the
word bank item's `ipa`, and below it the item's `say` (the English read the
Finnish way, "wooter"). For a word the learner already says well (`wordStanding`
"known"), the reading stays behind a free "Show how to say it" button until
answered.

## Word types

`src/lib/wordTypes.js` and `src/components/lingo/WordTypes.jsx` give every game
the same word-type hints. Word bank sentences carry `wordTypes`, one entry per
word (`"noun:subject"`, `"auxiliary"`, `"verb"`…; the list is `WORD_CLASSES` in
`src/lib/contentSchema.js`); single words have `pos`.

- `sentenceTypes(pair, words)` gives a sentence's types, `wordClassOf(word)` the
  class of a loose word (from `pos`, tagged sentences and a list of small words).
- `TypeLabel` names a type: the word class, or with `place` the place in the
  sentence (subject, object, or the class). `typeClass(type, colors)` colours an
  element by type; `TypeKey` is the colour key.
- `useTypePrefs()` reads the practice settings: `colors` (colour words by type)
  and `autoHelp`. `useLooseWordType()` is the one-liner for games with loose
  English words (Fill the Gap, Grammar check, Word Pairs colour theirs with it).
- `useAutoTypeHelp(pair, lang)` says when a sentence gets its hints for free:
  an easy one (level 1-2) when sentences of its level have been hard lately, or
  this sentence has been (`hardLevels`, `autoHints`).
- Paid hints go through `PaidHints` (`src/games/practice/RuleBox.jsx`), which
  spends this round's points; costs are `SLOT_HINT_COST` and `OPTION_HINT_COST`.

Build the phrase uses all of it: labelled places (8 points), word types on the
chips (5), colours, and the sentence-structure rule each sentence practises
(`sentencePattern`, the word bank's `sentence-…` rule items), shown after
answering and on the sentence rules page (`/phrase/rules`). Answers are
recorded under that rule, so the profile shows which structures are hard.

## Type it (spelling)

`src/games/type/` is a question-by-question game where the learner types the
English: a word or short phrase from its Finnish meaning, or (when the browser
can speak) a sentence they hear, with the Finnish as support. `typeLogic.js`
checks the typing: capitals, punctuation, contractions ("I'm" / "I am") and
British or American spelling don't count against the learner, but spelling
does; a letter or two off says "So close". Words also accept any other
English word in the pool with the same Finnish meaning. Hints are bought with
the round's points through `PaidHints` (`TYPE_HINT_COSTS`): first letters of
every word, the next letter (words) or next word (sentences), and hearing the
word. Hints never give away the last letter or word. Quick play asks the same
questions under `type-it`.

## Quick play and answer statistics

`recordWord` also keeps answer statistics, on the device only: per game and
per lesson (`gameId:lesson`) a tally of answers, first tries and answer time,
and per word its time and last few results (`recent`: `2` quick first try,
`1` solved after a miss or slowly, `0` missed). An answer counts as slow when
it takes over 1.6 times the learner's own average for that game.
PracticeSession times every answer and records the question's lesson
(`lesson`, `lessonId` or `setId`) for you; a game outside it passes `ms` and
`lesson` to `recordWord` itself, as hangman passes `ms`.

`src/lib/adaptive.js` reads those numbers: `wordStanding(entry)` says whether a
word is new, known, practising or tricky, and `challengeLessons(state)` lists
lessons with few first-try answers or slow answers.

Quick play (`/quick`, `src/games/quick/`) builds a round of 10 from them: three
easy wins (known words), three challenges (tricky words, then new words from
challenging lessons) and new or practising words, spread over words,
sentences, grammar and sounds, with no two challenges side by side and an easy
win first and last. The roles stay behind the scenes: learners don't see which
questions are easy wins or challenges. Each question is asked by one of the other games
(`quickTargets` lists which games can ask what) and recorded under that game,
so a new practice game can join Quick play by adding its questions there.
Targets carry the `categories` and `levels` of their word bank items, and
`buildQuickRound(targets, state, { include })` keeps only targets that pass
`include`. QuickPlay passes `preferenceFilter(targets)`, which applies the
learner's focus areas and difficulty (`src/lib/preferences.js`) to the whole
mix; grammar and sounds targets have no categories, so focus areas leave them in.

## Learner profile

`/profile` (`src/app/Profile.jsx`) shows what Lingo has worked out from the
answer statistics: an overall level and one per skill (from the share of
first-try answers, skills taken from each game's registry `skill`), what is
going well and what is worth practising (skills, lessons and word bank
topics), suggested focus areas and difficulty with buttons that save them to
the shared preferences, the last 7 days, and per-game and per-lesson tables.
The rules are pure functions in `src/lib/insights.js`. Days also keep
`firstTry`, `ms` and `timed`.

## Your turn, Spot the mistake, Word rush, Daily word, Read and understand

- **Your turn** (`talk/`, `/talk`): the word bank's two-person dialogues as
  conversations. The learner plays the dialogue's `you` (or the second
  speaker) and picks each of their lines from three: the line, a later line
  of theirs (right topic, wrong moment) and one from another conversation.
  The other side's lines appear after a short pause and are read aloud; any
  line can be tapped to hear it and see the Finnish. Each line is recorded
  with `onItem`. `?set=<text id>` plays one conversation.
- **Spot the mistake** (`mistake/`, `/spot-the-mistake`): grammar and
  mixed-up words gap sentences with one of their hand-written wrong options
  in the gap. Tap the wrong word, then pick the fix; the rule shows after.
  Items whose answer is "no word" are left out. `?set=<topic id>`.
- **Word rush** (`rush/`, `/word-rush`): 60 seconds of Finnish-to-English
  picks. Three in a row doubles the round score, six triples it, every five
  in a row adds three seconds. Every answer is recorded as in other games;
  the best score is kept on the device (`lingoRushBest`).
- **Daily word** (`daily/`, `/daily`): one five-letter word bank word a day,
  the same for everyone (`wordForDay`), guessed in six tries from its Finnish
  meaning. Any five letters can be tried. The day's word and guesses, played
  days and streak are kept on the device (`lingoDaily`); the game is recorded
  once when it ends. Its registry entry has `noPath: true`, so My path never
  plans steps of it.
- **Read and understand** (`read/`, `/read`): texts with `questions`; tap a
  sentence to hear it and see the Finnish, then answer the questions one at a
  time (each recorded with `onItem`). `?set=<text id>`.
