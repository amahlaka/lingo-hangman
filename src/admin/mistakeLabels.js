// Admin names for the mistake kinds in src/lib/mistakes.js.
export const MISTAKE_LABELS = {
  spelling: "Spelling",
  letter_order: "Letters in the wrong order",
  word_order: "Words in the wrong order",
  missing_words: "Words missing or extra",
  different_word: "A different word",
  wrong_choice: "Picked the wrong option",
  wrong_sound: "Wrong sound",
  wrong_pair: "Wrong pair",
  wrong_letters: "Letters not in the word",
  misheard: "Said something else",
  skipped: "Skipped",
};

export const mistakeLabel = (kind) => MISTAKE_LABELS[kind] || kind;

// [[kind, n], …], most common first.
export const kindRows = (kinds) => Object.entries(kinds || {}).sort((a, b) => b[1] - a[1]);
