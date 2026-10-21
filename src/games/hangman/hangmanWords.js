import { getAlphabet } from "../../lib/words";

// Hangman words Quick play can ask: at least three different letters of the
// alphabet (spaces and punctuation are shown), short enough for the tiles.
// Word bank words whose meaning is spelled the same (sauna, emoji, pasta) are
// left out: the meaning under the tiles would give the answer away.
export function isHangmanWord(pair, lang = "en") {
  if (givesAnswerAway(pair)) return false;
  const alphabet = getAlphabet(lang);
  const letters = pair.learning.toUpperCase().split("").filter((ch) => alphabet.includes(ch));
  return letters.length >= 3 && pair.learning.length <= 14 && new Set(letters).size >= 3;
}

// True when the meaning is the word itself, ignoring case and punctuation.
export function givesAnswerAway({ learning, native }) {
  const plain = (text) => String(text || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return plain(learning) !== "" && plain(learning) === plain(native);
}
