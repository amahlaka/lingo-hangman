import {
  answerShape,
  buildTypeRound,
  checkTyped,
  correctPrefix,
  isDictationSentence,
  isTypeWord,
  revealNextLetter,
  revealNextWord,
  typeQuestion,
} from "../games/type/typeLogic";
import { quickTargets } from "../games/quick/quickLogic";

describe("checkTyped", () => {
  it("ignores capitals, punctuation and spaces around the words", () => {
    expect(checkTyped("How much is this?", "  how much is this ").correct).toBe(true);
    expect(checkTyped("Where is the toilet?", "Where is the toilet.").correct).toBe(true);
  });

  it("accepts contractions spelt out, curly apostrophes and American spelling", () => {
    expect(checkTyped("I'm lost", "I am lost").correct).toBe(true);
    expect(checkTyped("I'm lost", "I’m lost").correct).toBe(true);
    expect(checkTyped("colour", "color").correct).toBe(true);
  });

  it("is strict about spelling, but says when it is close", () => {
    const r = checkTyped("kitchen", "kitchin");
    expect(r.correct).toBe(false);
    expect(r.close).toBe(true);
    expect(checkTyped("kitchen", "garden").close).toBe(false);
    // Homophones are different words in writing.
    expect(checkTyped("there", "their").correct).toBe(false);
  });

  it("accepts numbers and times typed with digits", () => {
    expect(checkTyped("We meet at six.", "we meet at 6").correct).toBe(true);
    expect(checkTyped("The shop opens at six thirty.", "The shop opens at 6:30").correct).toBe(true);
    expect(checkTyped("It is five o'clock.", "It is 5:00").correct).toBe(true);
    expect(checkTyped("It costs twenty-five euros.", "It costs 25 euros").correct).toBe(true);
    expect(checkTyped("See you at seven p.m.", "see you at 7pm").correct).toBe(true);
    expect(checkTyped("We meet at six.", "we meet at 7").correct).toBe(false);
    // A digit counts as the right word in the word-by-word marks too.
    expect(checkTyped("We meet at six today.", "we meet at 6 tomorrow").words.map((w) => w.ok)).toEqual([true, true, true, true, false]);
  });

  it("accepts the other right answers it is given", () => {
    expect(checkTyped("car", "auto", ["auto"]).correct).toBe(true);
  });

  it("marks the typed words that are in the answer, and counts the missing ones", () => {
    const r = checkTyped("Where is the toilet?", "where are the toilet");
    expect(r.words.map((w) => w.ok)).toEqual([true, false, true, true]);
    expect(r.missing).toBe(1);
  });
});

describe("hints", () => {
  it("reveals one letter after the part already right, never the last one", () => {
    expect(revealNextLetter("cat", "")).toBe("c");
    expect(revealNextLetter("cat", "cx")).toBe("ca");
    expect(revealNextLetter("cat", "", 2)).toBeNull();
    expect(revealNextLetter("ice cream", "ice")).toBe("ice c");
  });

  it("reveals the next word of a sentence, never the last one", () => {
    const s = "How much is this?";
    expect(revealNextWord(s, "")).toBe("How ");
    expect(revealNextWord(s, "How mu")).toBe("How much ");
    expect(revealNextWord(s, "How much ")).toBe("How much is ");
    expect(revealNextWord(s, "How much is ")).toBeNull();
  });

  it("counts the correct start without minding capitals", () => {
    expect(correctPrefix("how Mx", "How much")).toBe(5);
  });

  it("shows first letters and revealed letters in the shape", () => {
    const shape = answerShape("I'm lost", { firstLetters: true });
    expect(shape.filter((c) => c.shown && c.letter).map((c) => c.ch).join("")).toBe("Il");
    expect(answerShape("cat", { revealed: 2 }).map((c) => c.shown)).toEqual([true, true, false]);
  });
});

describe("rounds", () => {
  const words = [
    { learning: "dog", native: "koira" },
    { learning: "cat", native: "kissa" },
    { learning: "car", native: "auto" },
    { learning: "automobile", native: "auto" },
    { learning: "My name is...", native: "Nimeni on..." },
  ];
  const sentences = [
    { learning: "Where is the toilet?", native: "Missä on WC?" },
    { learning: "Tetris came out in 1984.", native: "Tetris julkaistiin 1984." },
    { learning: "We live in Helsinki.", native: "Asumme Helsingissä." },
    { learning: "I'm lost", native: "Olen eksynyt" },
  ];

  it("keeps words plain and sentences free of numbers and names", () => {
    expect(isTypeWord({ learning: "ice cream" })).toBe(true);
    expect(isTypeWord({ learning: "café" })).toBe(false);
    expect(sentences.filter(isDictationSentence).map((s) => s.learning)).toEqual(["Where is the toilet?"]);
    expect(isDictationSentence({ learning: "Can I help you?" })).toBe(true);
  });

  it("accepts other English words with the same Finnish meaning", () => {
    expect(typeQuestion(words[2], words).alternatives).toEqual(["automobile"]);
  });

  it("mixes dictation and words, with no unfinished phrases", () => {
    const round = buildTypeRound(words, sentences, { sentences: 2 });
    expect(round.filter((q) => q.mode === "dictation")).toHaveLength(1);
    expect(round.filter((q) => q.mode === "word")).toHaveLength(4);
    expect(buildTypeRound(words, sentences, { sentences: 0 }).every((q) => q.mode === "word")).toBe(true);
  });
});

describe("Quick play", () => {
  const pairs = ["dog", "cat", "bird", "fish"].map((learning, i) => ({ learning, native: `fi${i}` }));
  const sentences = [{ learning: "Where is the toilet?", native: "Missä on WC?" }];

  it("can ask words and, with sound, sentences to type", () => {
    const games = (withSound) =>
      quickTargets({ pairs, sentences, withSound }).flatMap((t) => t.kinds.filter((k) => k.game === "type-it").map((k) => k.make().mode));
    expect(games(true).sort()).toEqual(["dictation", "word", "word", "word", "word"]);
    expect(games(false)).not.toContain("dictation");
  });
});
