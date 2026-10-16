// Pure helpers for Read and understand: short texts from the word bank
// (messages, emails, notices, stories, dialogues) with a few easy questions
// each. No React here so the rules are easy to test.

import { shuffle } from "../practice/practiceLogic";
import { CHOICES } from "../../lib/decoys";

// Texts in one round.
export const READ_ROUND = 2;

export function isReadText(text) {
  return text?.type === "text" && Array.isArray(text.sentences) && (text.questions || []).some((q) => q.answers?.length);
}

// One text as a question: its sentences, and its questions each with the
// answer and up to three wrong options in random order.
export function readQuestion(text, random = Math.random) {
  return {
    id: text.id,
    setId: text.id,
    kind: text.kind,
    title: text.title?.en || text.id,
    titleFi: text.title?.fi || "",
    sentences: text.sentences.map((s) => ({ en: s.en, fi: s.fi || "", speaker: s.speaker || "" })),
    note: text.note || null,
    questions: (text.questions || [])
      .filter((q) => q.answers?.length)
      .map((q) => ({
        en: q.question.en,
        fi: q.question.fi || "",
        answer: q.answers[0],
        options: shuffle([q.answers[0], ...shuffle(q.distractors || [], random).slice(0, CHOICES - 1)], random),
      })),
  };
}

// A round of texts, none repeated, easier ones first.
export function buildReadRound(texts, { count = READ_ROUND, random = Math.random } = {}) {
  return shuffle(texts.filter(isReadText), random)
    .slice(0, count)
    .sort((a, b) => (a.level || 1) - (b.level || 1))
    .map((t) => readQuestion(t, random));
}
