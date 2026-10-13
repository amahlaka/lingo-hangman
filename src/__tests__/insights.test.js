import { emptyProgress, recordWord, wordKey } from "../lib/progress";
import { buildInsights, levelFor, wordScore } from "../lib/insights";

const games = [
  { id: "meaning", skill: "Vocabulary" },
  { id: "phrase", skill: "Sentences" },
  { id: "sounds", skill: "Pronunciation" },
];
const answer = (gameId, word, ok, extra = {}) => ({ gameId, word, lang: "en-GB", solved: ok, perfect: ok, ms: 3000, ...extra });

function play(results, day = "2026-10-13") {
  return results.reduce((s, r) => recordWord(s, r, { day }).state, emptyProgress());
}

describe("learner insights", () => {
  it("maps first-try shares to levels", () => {
    expect([0.2, 0.55, 0.75, 0.9].map(levelFor)).toEqual([1, 2, 3, 4]);
    expect(wordScore({ recent: "210" })).toBeCloseTo(0.5);
  });

  it("waits for enough answers before giving a level", () => {
    const s = play([answer("meaning", "dog", true)]);
    const ins = buildInsights(s, { games, today: "2026-10-13" });
    expect(ins.overall).toBeNull();
    expect(ins.skills[0]).toMatchObject({ id: "Vocabulary", level: null });
    expect(ins.suggestedDifficulty).toBeNull();
  });

  it("finds levels per skill, what is going well and what is worth practising", () => {
    const vocab = Array.from({ length: 12 }, (_, i) => answer("meaning", `w${i}`, true));
    const sentences = Array.from({ length: 10 }, (_, i) => answer("phrase", `s${i} words here`, i < 3));
    const silent = Array.from({ length: 5 }, (_, i) => answer("sounds", `k${i}`, i === 0, { lesson: "silent-k" }));
    const s = play([...vocab, ...sentences, ...silent]);
    const categoryOf = new Map([
      ...vocab.map((a) => [wordKey(a.word, "en-GB"), ["food"]]),
      ...sentences.map((a) => [wordKey(a.word, "en-GB"), ["time"]]),
    ]);
    const ins = buildInsights(s, { games, categoryOf, today: "2026-10-13" });
    expect(ins.overall.n).toBe(27);
    expect(ins.skills.find((x) => x.id === "Vocabulary").level).toBe(4);
    expect(ins.skills.find((x) => x.id === "Sentences").level).toBe(1);
    expect(ins.goingWell.map((c) => `${c.kind}:${c.id}`)).toEqual(expect.arrayContaining(["skill:Vocabulary", "topic:food"]));
    expect(ins.toPractise.map((c) => `${c.kind}:${c.id}`)).toEqual(
      expect.arrayContaining(["skill:Sentences", "lesson:sounds:silent-k", "topic:time"])
    );
    expect(ins.suggestedFocus).toEqual(["time"]);
    expect(ins.days).toHaveLength(7);
    expect(ins.days[6]).toMatchObject({ day: "2026-10-13", words: 27, firstTry: 16 });
    expect(ins.words.known + ins.words.practising + ins.words.tricky).toBe(27);
  });
});
