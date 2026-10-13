import { answerSummary, emptyProgress, recordWord, wordKey } from "../lib/progress";
import { challengeLessons, wordStanding } from "../lib/adaptive";
import {
  buildQuickRound,
  orderRound,
  pickQuickTargets,
  quickSummary,
  quickTargets,
  separateGames,
} from "../games/quick/quickLogic";
import {
  filterCommonWords,
  getGapItems,
  getSentences,
  getSoundLessons,
  getTopics,
  getWordGroups,
} from "../lib/words";

const answer = (word, extra = {}) => ({ gameId: "meaning", word, lang: "en-GB", solved: true, perfect: true, ms: 3000, ...extra });

function play(state, results) {
  return results.reduce((s, r) => recordWord(s, r).state, state);
}

describe("answer statistics", () => {
  it("keeps answer times per game and lesson, capped at a minute", () => {
    const s = play(emptyProgress(), [
      answer("dog", { ms: 2000 }),
      answer("cat", { ms: 4000 }),
      answer("knife", { gameId: "sounds", lesson: "silent-k", ms: 10 * 60 * 1000 }),
    ]);
    expect(s.stats.games.meaning).toEqual({ n: 2, solved: 2, firstTry: 2, ms: 6000, timed: 2 });
    expect(s.stats.lessons["sounds:silent-k"]).toMatchObject({ n: 1, ms: 60000, timed: 1 });
    const summary = answerSummary(s);
    expect(summary.timed).toBe(3);
    expect(summary.games[0].id).toBe("sounds");
    expect(summary.meanMs).toBeCloseTo(66000 / 3);
  });

  it("remembers each word's last results, marking misses and slow answers", () => {
    // Five quick answers set the learner's pace in this game.
    let s = play(emptyProgress(), ["a", "b", "c", "d", "e"].map((w) => answer(w, { ms: 2000 })));
    s = play(s, [
      answer("dog", { solved: false, perfect: false }),
      answer("dog", { perfect: false }),
      answer("dog", { ms: 20000 }),
      answer("dog"),
    ]);
    const dog = s.words[wordKey("dog", "en-GB")];
    expect(dog.recent).toBe("0112");
    expect(dog).toMatchObject({ solved: 3, lost: 1, timed: 4 });
  });

  it("loads saves from before statistics existed", () => {
    const old = { ...emptyProgress() };
    delete old.stats;
    const s = recordWord(old, answer("dog")).state;
    expect(s.stats.games.meaning.n).toBe(1);
  });
});

describe("word standing", () => {
  it("tells known, tricky, practising and new words apart", () => {
    expect(wordStanding(undefined)).toBe("new");
    expect(wordStanding({ solved: 2, lost: 0, days: [], recent: "22" })).toBe("known");
    expect(wordStanding({ solved: 2, lost: 1, days: [], recent: "202" })).toBe("tricky");
    expect(wordStanding({ solved: 3, lost: 0, days: [], recent: "111" })).toBe("tricky");
    expect(wordStanding({ solved: 1, lost: 0, days: [], recent: "1" })).toBe("practising");
    // Saves from before `recent` existed.
    expect(wordStanding({ solved: 3, lost: 0, days: ["2026-10-01", "2026-10-02"] })).toBe("known");
    expect(wordStanding({ solved: 1, lost: 3, days: ["2026-10-01"] })).toBe("tricky");
  });

  it("finds lessons that are mostly not right on the first try", () => {
    const s = play(emptyProgress(), [
      ...["a", "b", "c", "d"].map((w) => answer(w, { gameId: "sounds", lesson: "silent-k", perfect: false })),
      ...["e", "f", "g", "h"].map((w) => answer(w, { gameId: "sounds", lesson: "silent-b" })),
    ]);
    expect([...challengeLessons(s)]).toEqual(["sounds:silent-k"]);
  });
});

describe("quick play round", () => {
  const target = (key, group = "word") => ({
    key: wordKey(key, "en-GB"),
    group,
    kinds: [{ game: "meaning", make: () => ({ target: { learning: key, native: key } }) }],
  });

  it("mixes easy wins, challenges and fresh words, starting and ending easy", () => {
    const targets = [
      ...["k1", "k2", "k3", "k4"].map((w) => target(w)),
      ...["t1", "t2", "t3", "t4"].map((w) => target(w, "sentence")),
      ...["n1", "n2", "n3"].map((w) => target(w, "grammar")),
      ...["n4", "n5", "n6"].map((w) => target(w, "sounds")),
    ];
    let s = emptyProgress();
    s = play(s, ["k1", "k2", "k3", "k4"].flatMap((w) => [answer(w), answer(w)]));
    s = play(s, ["t1", "t2", "t3", "t4"].map((w) => answer(w, { solved: false, perfect: false })));
    const picks = pickQuickTargets(targets, s);
    expect(picks).toHaveLength(10);
    const roles = picks.map((p) => p.role);
    expect(roles.filter((r) => r === "easy")).toHaveLength(3);
    expect(roles.filter((r) => r === "challenge")).toHaveLength(3);
    expect(roles[0]).toBe("easy");
    expect(roles[roles.length - 1]).toBe("easy");
    roles.forEach((r, i) => {
      if (r === "challenge") expect(roles[i + 1]).not.toBe("challenge");
    });
    picks.filter((p) => p.role === "challenge").forEach((p) => expect(p.target.key).toMatch(/:t\d/));
    expect(new Set(picks.map((p) => p.target.key)).size).toBe(10);
  });

  it("is all fresh words for a new player", () => {
    const targets = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"].map((w) => target(w));
    const picks = pickQuickTargets(targets, emptyProgress());
    expect(picks).toHaveLength(10);
    expect(picks.every((p) => p.role === "fresh")).toBe(true);
  });

  it("spreads challenges out, with or without easy wins", () => {
    const many = (role, n) => Array.from({ length: n }, (_, i) => ({ role, i }));
    const withEasy = orderRound(many("easy", 3), many("challenge", 3), many("fresh", 4)).map((p) => p.role);
    expect(withEasy[0]).toBe("easy");
    expect(withEasy[9]).toBe("easy");
    const noEasy = orderRound([], many("challenge", 3), many("fresh", 7)).map((p) => p.role);
    for (const roles of [withEasy, noEasy]) {
      expect(roles).toHaveLength(10);
      roles.forEach((r, i) => r === "challenge" && expect(roles[i + 1]).not.toBe("challenge"));
    }
  });

  it("builds a varied round from the real word bank", () => {
    const targets = quickTargets({
      pairs: filterCommonWords({ learningLang: "en-GB", nativeLang: "fi" }),
      sentences: getSentences(),
      gapItems: getGapItems(),
      topics: { rule: getTopics("rule"), confusable: getTopics("confusable") },
      lessons: getSoundLessons(),
      groups: getWordGroups(),
    });
    const groups = new Set(targets.map((t) => t.group));
    expect([...groups].sort()).toEqual(["grammar", "sentence", "sounds", "word"]);
    // A learner with some known and some tricky words, a few of them sounds words.
    const state = play(emptyProgress(), [
      ...["dog", "cat", "bread", "knee", "lamb"].flatMap((w) => [answer(w), answer(w)]),
      ...["knife", "comb", "milk", "water"].map((w) => answer(w, { solved: false, perfect: false })),
    ]);
    for (const s of [emptyProgress(), state]) {
      for (let n = 0; n < 20; n++) {
        const round = buildQuickRound(targets, s);
        expect(round).toHaveLength(10);
        const games = round.map((q) => q.quick.game);
        expect(new Set(games).size).toBeGreaterThanOrEqual(4);
        const repeats = games.filter((g, i) => i > 0 && g === games[i - 1]).length;
        expect(repeats).toBeLessThanOrEqual(1);
        round.forEach((q) => expect(q.gameId).toBe(q.quick.game));
      }
    }
  });

  it("moves a question so the same game doesn't come twice in a row", () => {
    const q = (game, role = "fresh") => ({ quick: { game, role } });
    const out = separateGames([q("meaning", "easy"), q("sounds"), q("sounds"), q("phrase"), q("listening"), q("meaning", "easy")]);
    const games = out.map((x) => x.quick.game);
    games.forEach((g, i) => i > 0 && expect(g).not.toBe(games[i - 1]));
    expect(out.map((x) => x.quick.role)).toEqual(["easy", "fresh", "fresh", "fresh", "fresh", "easy"]);
  });

  it("narrows the round to the learner's settings when enough targets fit", () => {
    const targets = quickTargets({
      pairs: filterCommonWords({ learningLang: "en-GB", nativeLang: "fi" }),
      sentences: getSentences(),
      gapItems: getGapItems(),
      lessons: getSoundLessons(),
    });
    const counts = {};
    targets.forEach((t) => t.categories.forEach((c) => (counts[c] = (counts[c] || 0) + 1)));
    const [top] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const inTop = (t) => t.categories.includes(top);
    expect(targets.filter(inTop).length).toBeGreaterThanOrEqual(10);
    expect(pickQuickTargets(targets, emptyProgress(), { include: inTop }).every((p) => inTop(p.target))).toBe(true);
    expect(pickQuickTargets(targets, emptyProgress(), { include: () => false })).toHaveLength(10);
  });

  it("summarises easy wins and challenges", () => {
    const r = (role, solved) => ({ solved, question: { quick: { role } } });
    expect(quickSummary([r("easy", true), r("easy", true), r("challenge", false), r("challenge", true), r("fresh", true)])).toEqual({
      easy: { total: 2, solved: 2 },
      challenge: { total: 2, solved: 1 },
    });
  });
});
