import { getAlphabet } from "../../lib/words";

// Hangman words Quick play can ask: at least three different letters of the
// alphabet (spaces and punctuation are shown), short enough for the tiles.
export function isHangmanWord(pair, lang = "en") {
  const alphabet = getAlphabet(lang);
  const letters = pair.learning.toUpperCase().split("").filter((ch) => alphabet.includes(ch));
  return letters.length >= 3 && pair.learning.length <= 14 && new Set(letters).size >= 3;
}
