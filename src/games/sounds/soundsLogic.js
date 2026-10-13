// Pure helpers for Sounds of English. Lessons are the word bank's "sound"
// items (getSoundLessons in src/lib/words.js): a rule in English and Finnish
// and the words that show it, with square brackets around the letters the
// rule is about ("[k]nife"). No React here so the rules are easy to test.

import { parseMarked } from "../../lib/contentSchema";
import { wordKey } from "../../lib/progress";
import { MAX_MISSES, ROUND_LENGTH, shuffle } from "../practice/practiceLogic";

// Order of the sections on the lesson list.
export const KINDS = ["silent", "sound", "letters"];

// One lesson word, ready to show and say:
// { text: "knife", parts: { before, marked, after } | null, say, fi, note, speak, sound }
export function lessonWord(lesson, word) {
  const parts = lesson.kind === "letters" ? null : parseMarked(word.text);
  const text = parts ? parts.plain : word.text;
  return {
    text,
    parts,
    say: word.say?.fi || "",
    fi: word.meaning?.fi || "",
    note: word.note || null,
    speak: word.speak || text,
    sound: word.sound || null,
  };
}

export function lessonWords(lesson) {
  return lesson.words.map((w) => lessonWord(lesson, w));
}

// Letter positions (in the plain word) of the bracketed part.
export function markedIndexes(word) {
  if (!word.parts) return [];
  const start = word.parts.before.length;
  return Array.from({ length: word.parts.marked.length }, (_, i) => start + i);
}

// Misses allowed before the answer is shown; with two options one miss
// already leaves only the answer.
export function maxMissesFor(optionCount) {
  return Math.max(1, Math.min(MAX_MISSES, optionCount - 1));
}

// Every word of a lesson as a question.
//   silent:  tap the letter you don't hear (`letters` are the word's letters)
//   sound:   pick the sound the marked letters make (`options` are the lesson's sounds)
//   letters: hear a letter name and pick the letter (`options` are letters of the lesson)
export function lessonQuestions(lesson, random = Math.random) {
  const words = lessonWords(lesson);
  return words.map((word) => {
    const base = {
      id: `${lesson.id}:${word.text}`,
      lessonId: lesson.id,
      kind: lesson.kind,
      title: lesson.title,
      explanation: lesson.explanation,
      word,
    };
    if (lesson.kind === "silent") return { ...base, letters: word.text.split("") };
    if (lesson.kind === "sound") {
      return { ...base, options: lesson.sounds.map((s) => ({ id: s.id, label: s.label })), answer: word.sound };
    }
    const others = shuffle(words.filter((w) => w !== word), random).slice(0, 3);
    return { ...base, options: shuffle([word, ...others], random).map((w) => ({ id: w.text, label: { en: w.text }, say: w.say })), answer: word.text };
  });
}

// One round. `setId` practises one lesson; otherwise questions are spread over
// as many lessons as possible, so a mix isn't ten silent-k words.
// `withSound: false` leaves out letter names, which can't be asked without audio.
export function buildSoundRound(lessons, { setId = null, count = ROUND_LENGTH, withSound = true, random = Math.random } = {}) {
  let pool = lessons.filter((l) => withSound || l.kind !== "letters");
  if (setId) pool = pool.filter((l) => l.id === setId);
  const queues = shuffle(pool.map((l) => shuffle(lessonQuestions(l, random), random)), random);
  const round = [];
  while (round.length < count && queues.some((q) => q.length)) {
    for (const queue of queues) {
      if (round.length >= count) break;
      if (queue.length) round.push(queue.shift());
    }
  }
  return round;
}

// How many words of a lesson have been solved at least once, from progress
// state (src/lib/progress.js).
export function lessonProgress(lesson, progressState, lang = "en-GB") {
  const words = lessonWords(lesson);
  const solved = words.filter((w) => (progressState?.words?.[wordKey(w.text, lang)]?.solved || 0) > 0).length;
  return { solved, total: words.length };
}
