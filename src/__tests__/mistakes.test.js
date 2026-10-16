import { answerMistakes, editDistance, mistakeKind } from "../lib/mistakes";
import { cleanEvent, makeEvent } from "../lib/syncEvents";

describe("how learners go wrong", () => {
  it.each([
    ["type-it", "oatmeal", "oltmil", "spelling"],
    ["type-it", "file", "fiel", "letter_order"],
    ["type-it", "cat", "dog", "different_word"],
    ["type-it", "I would like tea", "I like tea", "missing_words"],
    ["type-it", "Where is the station?", "were is the stasion", "spelling"],
    ["type-it", "Where is the station?", "where the station is", "word_order"],
    ["phrase", "how are you", "you are how", "word_order"],
    ["mixed-up", "borrow", "lend", "wrong_choice"],
    ["meaning", "dog", "cat", "wrong_choice"],
    ["sounds", "knife", "k", "wrong_sound"],
    ["say", "thought", "taught", "misheard"],
    ["word-pairs", "dog", "kissa", "wrong_pair"],
  ])("%s: %s typed as %s is %s", (game, expected, given, kind) => {
    expect(mistakeKind(game, expected, given)).toBe(kind);
  });

  it("counts edits", () => {
    expect(editDistance("oatmeal", "oltmil")).toBe(3);
    expect(editDistance("", "abc")).toBe(3);
  });

  it("lists an answer's mistakes, hangman letters together and skips", () => {
    expect(answerMistakes({ gameId: "hangman", word: "dog", wrong: ["E", "A"] })).toEqual([{ kind: "wrong_letters", given: "E A" }]);
    expect(answerMistakes({ gameId: "type-it", word: "oatmeal", wrong: ["oltmil", "otmeal"], skipped: true }).map((m) => m.kind)).toEqual([
      "spelling",
      "spelling",
      "skipped",
    ]);
    expect(answerMistakes({ gameId: "meaning", word: "dog", solved: true })).toEqual([]);
  });

  it("keeps wrong answers in synced events, within limits", () => {
    const e = makeEvent("answer", {
      result: { gameId: "type-it", word: "oatmeal", solved: false, wrong: ["oltmil", " ", 5, "x".repeat(500)], skipped: true },
      day: "2026-10-16",
    });
    const clean = cleanEvent(e).payload.result;
    expect(clean.wrong).toEqual(["oltmil", "x".repeat(120)]);
    expect(clean.skipped).toBe(true);
  });
});
