// How a learner went wrong, from what they answered (the `wrong` list an
// answer carries, see syncEvents.js). Shared by the API's statistics
// (server/src/stats) and its admin pages. Pure functions.
//
// Kinds:
//   spelling        typed close to the word ("oltmil" for "oatmeal")
//   letter_order    the right letters in the wrong order ("fiel" for "file")
//   word_order      the right words in the wrong order
//   missing_words   words left out or added
//   different_word  typed something else entirely
//   wrong_choice    picked another option (meaning, listening, grammar, gaps)
//   wrong_sound     picked the wrong sound or silent letter (Sounds of English)
//   wrong_pair      matched a word with the wrong partner (Word Pairs)
//   wrong_letters   guessed letters not in the word (Hangman)
//   misheard        Say it heard something else
//   skipped         skipped the question

export const MISTAKE_KINDS = [
  "spelling",
  "letter_order",
  "word_order",
  "missing_words",
  "different_word",
  "wrong_choice",
  "wrong_sound",
  "wrong_pair",
  "wrong_letters",
  "misheard",
  "skipped",
];

const TYPED_GAMES = new Set(["type-it"]);
const ORDER_GAMES = new Set(["phrase"]);

export const normalizeAnswer = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export function editDistance(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const sorted = (list) => [...list].sort().join("\u0000");

// A word typed close enough to count as a spelling mistake.
const closeSpelling = (given, expected) => editDistance(given, expected) <= Math.max(1, Math.ceil(expected.length * 0.45));

// The kind of one wrong answer to `expected` in `gameId`.
export function mistakeKind(gameId, expected, given) {
  if (gameId === "hangman") return "wrong_letters";
  if (gameId === "word-pairs") return "wrong_pair";
  if (gameId === "say") return "misheard";
  if (gameId === "sounds") return "wrong_sound";
  const e = normalizeAnswer(expected);
  const g = normalizeAnswer(given);
  const ew = e.split(" ");
  const gw = g.split(" ");
  if (ew.length > 1 && gw.length === ew.length && sorted(ew) === sorted(gw)) return "word_order";
  if (ORDER_GAMES.has(gameId)) return ew.length === gw.length ? "word_order" : "missing_words";
  if (!TYPED_GAMES.has(gameId)) return "wrong_choice";
  if (ew.length === 1 && gw.length === 1) {
    if (g.length === e.length && sorted([...g]) === sorted([...e])) return "letter_order";
    return closeSpelling(g, e) ? "spelling" : "different_word";
  }
  if (gw.length !== ew.length) return "missing_words";
  // A sentence of the same length: spelling when every differing word is close.
  const off = ew.filter((w, i) => w !== gw[i]);
  if (off.length === 0) return "spelling"; // punctuation or spacing
  return ew.every((w, i) => w === gw[i] || closeSpelling(gw[i], w)) ? "spelling" : "different_word";
}

// Every mistake in one recorded answer: [{ kind, given }].
export function answerMistakes(result) {
  const wrong = Array.isArray(result?.wrong) ? result.wrong : [];
  if (result?.gameId === "hangman" && wrong.length) return [{ kind: "wrong_letters", given: wrong.join(" ") }];
  const out = wrong.map((given) => ({ kind: mistakeKind(result.gameId, result.word || "", given), given }));
  if (result?.skipped) out.push({ kind: "skipped", given: "" });
  return out;
}
