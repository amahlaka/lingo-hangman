// Pure helpers for Your turn: everyday conversations from the word bank's
// dialogue texts, where the learner plays one speaker and picks each of their
// lines from three. No React here so the rules are easy to test.

import { shuffle } from "../practice/practiceLogic";

// Conversations in one round.
export const TALK_ROUND = 3;
// Replies to choose from on each of the learner's turns.
export const TALK_CHOICES = 3;

const norm = (s) => s.trim().toLowerCase();

// The speakers of a dialogue in the order they first speak.
export function speakersOf(text) {
  return [...new Set((text.sentences || []).map((s) => s.speaker).filter(Boolean))];
}

// Who the learner plays: the dialogue's `you` when it names one of its
// speakers, otherwise the second speaker (the one answering).
export function learnerSpeaker(text) {
  const speakers = speakersOf(text);
  if (text.you && speakers.includes(text.you)) return text.you;
  return speakers[1] || speakers[0];
}

// Dialogues that work as a conversation: two speakers, each speaking.
export function isTalkText(text) {
  return text?.kind === "dialogue" && speakersOf(text).length === 2;
}

function learnerLines(text) {
  const you = learnerSpeaker(text);
  return text.sentences.filter((s) => s.speaker === you).map((s) => s.en);
}

// Wrong replies for one of the learner's lines: first a later line of their
// own from this conversation (right topic, wrong moment), then lines from
// other conversations.
export function pickReplies(line, own, others, count = TALK_CHOICES - 1, random = Math.random) {
  const seen = new Set([norm(line)]);
  const out = [];
  const add = (l) => {
    if (out.length >= count || seen.has(norm(l))) return false;
    seen.add(norm(l));
    out.push(l);
    return true;
  };
  // One of their lines still to come is enough (lines already said are on
  // screen); the rest come from other conversations.
  const at = own.indexOf(line);
  shuffle(own.slice(at + 1), random).some(add);
  shuffle(others, random).forEach(add);
  return out;
}

// One conversation as a question: `lines` in order, each `{ speaker, en, fi,
// mine }`, and on the learner's lines `options` (the line and wrong replies,
// shuffled).
export function buildTalk(text, allTexts = [], random = Math.random) {
  const you = learnerSpeaker(text);
  const partner = speakersOf(text).find((s) => s !== you) || "";
  const own = learnerLines(text);
  const others = allTexts.filter((t) => t.id !== text.id && isTalkText(t)).flatMap(learnerLines);
  const lines = text.sentences.map((s) => {
    const mine = s.speaker === you;
    const line = { speaker: s.speaker, en: s.en, fi: s.fi || "", mine };
    if (mine) line.options = shuffle([s.en, ...pickReplies(s.en, own, others, TALK_CHOICES - 1, random)], random);
    return line;
  });
  return {
    id: text.id,
    setId: text.id,
    title: text.title?.en || text.id,
    titleFi: text.title?.fi || "",
    you,
    partner,
    lines,
    note: text.note || null,
  };
}

// A round of conversations from `texts`, none repeated. Wrong replies come
// from `allTexts` (every dialogue, by default `texts`).
export function buildTalkRound(texts, { count = TALK_ROUND, allTexts = texts, random = Math.random } = {}) {
  const usable = texts.filter(isTalkText);
  return shuffle(usable, random)
    .slice(0, count)
    .map((t) => buildTalk(t, allTexts, random));
}

// Where the conversation stops next: the index of the learner's next line at
// or after `from`, or the number of lines when only the other speaker's lines
// are left.
export function nextTurn(lines, from) {
  for (let i = from; i < lines.length; i++) if (lines[i].mine) return i;
  return lines.length;
}
