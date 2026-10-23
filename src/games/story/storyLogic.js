// Pure helpers for Story words: a short word bank text read part by part,
// picking the Finnish meaning of each word or phrase. The parts come from the
// sentences' `parts` (see the lingo-wordbase AUTHORING.md). No React here so
// the rules are easy to test.

import { shuffle } from "../practice/practiceLogic";
import { sentenceWords } from "../../lib/contentSchema";

// Stories in one round.
export const STORY_ROUND = 1;

// A text needs at least this many asked parts to be worth a round.
export const STORY_MIN_PARTS = 3;

const words = (text) => sentenceWords(text).join(" ").toLowerCase();
const asked = (part) => typeof part?.fi === "string" && Array.isArray(part.wrong);

export function storyPartCount(text) {
  return (text?.sentences || []).reduce((n, s) => n + (Array.isArray(s?.parts) ? s.parts.filter(asked).length : 0), 0);
}

export function isStoryText(text) {
  return text?.type === "text" && Array.isArray(text.sentences) && storyPartCount(text) >= STORY_MIN_PARTS;
}

// The sentence as it is written, cut at its parts: the punctuation stays with
// the part it is next to ("arrived," "sleep."). A sentence whose parts don't
// add up to its words is shown whole.
export function storyPieces(sentence) {
  const whole = [{ text: sentence.en }];
  if (!Array.isArray(sentence.parts) || !sentence.parts.length) return whole;
  const tokens = String(sentence.en).trim().split(/\s+/);
  const counts = tokens.map((tok) => sentenceWords(tok).length);
  const pieces = [];
  let at = 0;
  for (const part of sentence.parts) {
    const need = sentenceWords(part.en).length;
    const start = at;
    let got = 0;
    while (at < tokens.length && got < need) {
      got += counts[at];
      at += 1;
    }
    // Lone punctuation after the part ("–", "&") stays with it.
    while (at < tokens.length && counts[at] === 0) at += 1;
    const text = tokens.slice(start, at).join(" ");
    if (!need || got !== need || words(text) !== words(part.en)) return whole;
    const piece = { text, en: part.en };
    if (asked(part)) Object.assign(piece, { fi: part.fi, wrong: part.wrong });
    pieces.push(piece);
  }
  return at === tokens.length ? pieces : whole;
}

// One story as a question: its sentences cut into pieces, the asked pieces
// with their Finnish meaning and the options to pick from (the meaning and
// its one or two wrong ones) in random order.
export function storyQuestion(text, random = Math.random) {
  return {
    id: text.id,
    setId: text.id,
    kind: text.kind,
    title: text.title?.en || text.id,
    titleFi: text.title?.fi || "",
    sentences: text.sentences.map((s) => ({
      en: s.en,
      fi: s.fi || "",
      speaker: s.speaker || "",
      pieces: storyPieces(s).map(({ wrong, ...piece }) =>
        piece.fi ? { ...piece, options: shuffle([piece.fi, ...wrong], random) } : piece
      ),
    })),
  };
}

// The asked pieces in reading order, as [sentence, piece] places.
export function storyAsks(question) {
  const out = [];
  question.sentences.forEach((s, si) => s.pieces.forEach((p, pi) => p.fi && out.push([si, pi])));
  return out;
}

// A round of stories, none repeated, easier ones first.
export function buildStoryRound(texts, { count = STORY_ROUND, random = Math.random } = {}) {
  return shuffle(texts.filter(isStoryText), random)
    .slice(0, count)
    .sort((a, b) => (a.level || 1) - (b.level || 1))
    .map((t) => storyQuestion(t, random));
}
