import { buildWordsQuery, decodeWords, encodeWords, filterCommonWords, loadWordSet, pickCommonWords } from "../lib/words";

describe("word sets", () => {
  it("round-trips pairs through the link format, including non-ASCII", () => {
    const pairs = [{ learning: "apple", native: "omena" }, { learning: "tree", native: "pähkinäpuu" }];
    expect(decodeWords(encodeWords(pairs))).toEqual(pairs);
  });

  it("reads links made by the old generator", () => {
    expect(decodeWords("W3sibGVhcm5pbmciOiJjYXQiLCJuYXRpdmUiOiJraXNzYSJ9XQ%3D%3D")).toEqual([
      { learning: "cat", native: "kissa" },
    ]);
  });

  it("loads a word set from URL params", () => {
    const query = buildWordsQuery({ pairs: [{ learning: "cat", native: "kissa" }], swap: true });
    const set = loadWordSet(new URLSearchParams(query));
    expect(set).toMatchObject({ learningLang: "en-GB", nativeLang: "fi", swap: true, fromLink: true });
    expect(set.pairs).toEqual([{ learning: "cat", native: "kissa" }]);
  });

  it("falls back to sample words for an unreadable link", () => {
    expect(loadWordSet(new URLSearchParams("words=%%%")).pairs.length).toBeGreaterThan(0);
  });

  it("filters built-in words by category and uses British spelling for en-GB", () => {
    const food = filterCommonWords({ include: ["food"] });
    expect(food.length).toBeGreaterThan(0);
    expect(food.every((w) => w.categories.includes("food"))).toBe(true);
    expect(filterCommonWords({ exclude: ["food"] }).some((w) => w.categories.includes("food"))).toBe(false);
    expect(filterCommonWords().some((w) => w.learning === "colour")).toBe(true);
    expect(pickCommonWords({ count: 3 })).toHaveLength(3);
  });
});
