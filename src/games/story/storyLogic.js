// Pure helpers for Translate the story: a short passage of a classic story
// translated into Finnish phrase by phrase. The phrases and their wrong
// translations come from the sentences' `phrases` (see the lingo-wordbase
// AUTHORING.md). No React here so the rules are easy to test.

import { shuffle } from "../practice/practiceLogic";

// Stories in one round.
export const STORY_ROUND = 1;

const hasPhrases = (s) =>
  Array.isArray(s?.phrases) && s.phrases.length > 0 && s.phrases.every((p) => typeof p?.fi === "string" && Array.isArray(p.wrong));

// A text the game can play: every sentence split into phrases, so the whole
// story gets translated.
export function isStoryText(text) {
  return text?.type === "text" && Array.isArray(text.sentences) && text.sentences.length >= 2 && text.sentences.every(hasPhrases);
}

// One story as a question: its sentences and their phrases, each phrase with
// its translation and the options to pick from (the translation and its one
// or two wrong ones) in random order.
export function storyQuestion(text, random = Math.random) {
  return {
    id: text.id,
    setId: text.id,
    kind: text.kind,
    title: text.title?.en || text.id,
    titleFi: text.title?.fi || "",
    source: text.source || null,
    note: text.note || null,
    sentences: text.sentences.map((s) => ({
      en: s.en,
      fi: s.fi || "",
      phrases: s.phrases.map((p) => ({ en: p.en, fi: p.fi, options: shuffle([p.fi, ...p.wrong], random) })),
    })),
  };
}

// Every phrase in reading order, as [sentence, phrase] places.
export function storyAsks(question) {
  return question.sentences.flatMap((s, si) => s.phrases.map((_, pi) => [si, pi]));
}

// A round of stories, none repeated, easier ones first.
export function buildStoryRound(texts, { count = STORY_ROUND, random = Math.random } = {}) {
  return shuffle(texts.filter(isStoryText), random)
    .slice(0, count)
    .sort((a, b) => (a.level || 1) - (b.level || 1))
    .map((t) => storyQuestion(t, random));
}
