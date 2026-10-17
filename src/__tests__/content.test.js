import bundled from "../lib/bundledContent";
import { buildContent, getContent, loadPublishedContent, setContent } from "../lib/content";
import { formatPack, validateContent, validateItem } from "../lib/contentSchema";
import {
  ALL_CATEGORIES,
  LANGUAGE_OPTIONS,
  categoryLabel,
  filterCommonWords,
  getAlphabet,
  getGapItems,
  getItem,
  getSentences,
  getTopics,
  getWordGroups,
} from "../lib/words";
import { changedFiles, draftFrom, tidyItem } from "../admin/adminDraft";
import { PublishConflict, publishToGitHub } from "../admin/githubPublish";

const clone = (v) => JSON.parse(JSON.stringify(v));

afterEach(() => setContent(bundled));

describe("word bank files", () => {
  it("pass every check", () => {
    expect(validateContent(bundled)).toEqual([]);
  });

  it("are written in the standard layout", () => {
    const fs = require("fs");
    for (const pack of bundled.packs) {
      expect(fs.readFileSync(`content/packs/${pack.id}.json`, "utf8")).toBe(formatPack(pack));
    }
  });

  it("load every listed pack", () => {
    const { skipped, items } = getContent();
    expect(skipped).toEqual([]);
    expect(items.filter((i) => i.type === "word").length).toBeGreaterThanOrEqual(112);
  });
});

describe("item checks", () => {
  const gap = { id: "g", type: "gap", lang: "en", sentence: "I ___ tea.", answers: ["drink"], distractors: ["eat"] };

  it("accepts a good gap sentence, including 'no word' options", () => {
    expect(validateItem(gap)).toEqual([]);
    expect(validateItem({ ...gap, answers: [""], distractors: ["a", "the"] })).toEqual([]);
  });

  it("explains what is wrong", () => {
    expect(validateItem({ ...gap, sentence: "I ___ ___ tea." })[0]).toMatch(/exactly one ___/);
    expect(validateItem({ ...gap, distractors: ["Drink"] })[0]).toMatch(/both an answer and a wrong option/);
    expect(validateItem({ ...gap, topic: "nope" }, { topicIds: new Set() })[0]).toMatch(/topic "nope"/);
    expect(validateItem({ id: "Bad Id", type: "word", text: { en: "x" } })[0]).toMatch(/^id must be/);
    expect(validateItem({ id: "w", type: "word", text: { fi: "kissa" } })).toEqual(['text needs "en"']);
  });

  it("checks a sentence's other word orders", () => {
    const shoes = { id: "shoes-off", type: "word", text: { en: "Please take your shoes off.", fi: "Ota kengät pois." } };
    expect(validateItem({ ...shoes, otherOrders: { en: ["Please take off your shoes."] } })).toEqual([]);
    expect(validateItem({ ...shoes, otherOrders: { en: ["Please remove your shoes."] } })[0]).toMatch(/same words/);
    expect(validateItem({ ...shoes, otherOrders: { en: ["please take your shoes off"] } })[0]).toMatch(/own order/);
    expect(validateItem({ ...shoes, otherOrders: { sv: ["Ta av dig skorna."] } })[0]).toMatch(/no sv text/);
  });

  it("finds duplicate ids and unlisted packs across files", () => {
    const raw = clone(bundled);
    raw.packs[0].items.push(clone(raw.packs[1].items[0]));
    raw.packs.push({ id: "stray", title: { en: "Stray" }, items: [] });
    const problems = validateContent(raw);
    expect(problems.some((p) => /id is already used/.test(p))).toBe(true);
    expect(problems.some((p) => /stray.json: is not listed/.test(p))).toBe(true);
  });

  it("checks the focus area groups", () => {
    const raw = clone(bundled);
    raw.index.categoryGroups = [
      { id: "a", title: { en: "A" }, categories: ["food", "home"] },
      { id: "b", title: {}, categories: ["food"] },
    ];
    const problems = validateContent(raw);
    expect(problems.some((p) => /"food" is in more than one group/.test(p))).toBe(true);
    expect(problems.some((p) => /categoryGroups.b.title/.test(p))).toBe(true);
  });
});

describe("loading", () => {
  it("skips broken items instead of failing", () => {
    const raw = clone(bundled);
    raw.packs[0].items.unshift({ id: "broken", type: "word", text: {} });
    const content = buildContent(raw);
    expect(content.byId.has("broken")).toBe(false);
    expect(content.skipped).toHaveLength(1);
  });

  it("switches to the published copy and keeps the built-in one when that fails", async () => {
    const raw = clone(bundled);
    raw.packs.find((p) => p.id === "everyday-words").items.push({ id: "moose", type: "word", text: { en: "moose", fi: "hirvi" }, categories: ["animals"] });
    const files = { "index.json": raw.index, "languages.json": raw.languages };
    raw.packs.forEach((p) => { files[`packs/${p.id}.json`] = p; });
    const fetchOk = jest.fn(async (url) => ({ ok: true, json: async () => files[url.replace("/content/", "")] }));

    await expect(loadPublishedContent({ fetchImpl: fetchOk })).resolves.toBe(true);
    expect(filterCommonWords({ include: ["animals"] })).toEqual([
      { id: "moose", learning: "moose", native: "hirvi", categories: ["animals"], time: undefined },
    ]);
    expect(ALL_CATEGORIES).toContain("animals");

    setContent(bundled);
    const fetchMissing = jest.fn(async () => ({ ok: false, status: 404 }));
    await expect(loadPublishedContent({ fetchImpl: fetchMissing })).resolves.toBe(false);
    expect(ALL_CATEGORIES).not.toContain("animals");
  });
});

describe("word bank API", () => {
  it("gives gap sentences per topic, with the topic to explain them", () => {
    const rules = getTopics("rule");
    expect(rules.map((r) => r.id)).toContain("a-or-an");
    const gaps = getGapItems({ topic: "a-or-an" });
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.every((g) => g.sentence.includes("___") && g.topic === "a-or-an")).toBe(true);
    expect(getItem(gaps[0].topic).type).toBe("rule");
    expect(getTopics("confusable").map((c) => c.id)).toContain("borrow-lend");
  });

  it("gives word groups and whole sentences", () => {
    expect(getWordGroups()).toContainEqual(["is", "are", "am", "was", "were"]);
    const sentences = getSentences();
    expect(sentences.length).toBeGreaterThan(150);
    expect(sentences.every((s) => s.learning.split(" ").length >= 2 && s.native && !s.learning.includes("___"))).toBe(true);
  });

  it("knows languages, alphabets and category names", () => {
    expect(LANGUAGE_OPTIONS[0]).toEqual({ code: "en-GB", label: "English (UK)" });
    expect(getAlphabet("fi")).toContain("Ä");
    expect(getAlphabet("xx")).toHaveLength(26);
    expect(categoryLabel("hanging-out", "fi")).toBe("Ajanviete");
    expect(categoryLabel("unnamed")).toBe("Unnamed");
    expect(filterCommonWords({ learningLang: "en-GB" }).some((w) => w.learning === "colour")).toBe(true);
    expect(filterCommonWords({ learningLang: "en" }).some((w) => w.learning === "color")).toBe(true);
  });
});

describe("admin draft", () => {
  it("lists only the files that changed, written tidily", () => {
    const original = draftFrom(bundled);
    const draft = clone(original);
    expect(changedFiles(draft, original)).toEqual([]);
    const pack = draft.packs.find((p) => p.id === "everyday-words");
    pack.items.push({ id: "moose", type: "word", text: { en: "moose", fi: "hirvi", de: "" }, categories: [] });
    const changes = changedFiles(draft, original);
    expect(changes.map((c) => c.path)).toEqual(["packs/everyday-words.json"]);
    expect(changes[0].content).toContain('{"id":"moose","type":"word","text":{"en":"moose","fi":"hirvi"}}');
  });

  it("drops empty optional fields", () => {
    expect(tidyItem({ id: "g", type: "gap", lang: "en", sentence: "a ___", answers: ["b"], distractors: ["c"], translation: { fi: "" }, explanation: {}, topic: "" }))
      .toEqual({ id: "g", type: "gap", lang: "en", sentence: "a ___", answers: ["b"], distractors: ["c"] });
  });
});

describe("publishing to GitHub", () => {
  const b64 = (text) => Buffer.from(text, "utf8").toString("base64");
  const file = { path: "packs/x.json", original: '{"id":"x","items":[]}', content: '{"id":"x","items":[1]}' };

  function fakeGitHub(remoteText) {
    const calls = [];
    const fetchImpl = jest.fn(async (url, { method = "GET", body } = {}) => {
      const path = url.replace("https://api.github.com/repos/o/r/", "");
      calls.push(`${method} ${path.split("?")[0]}`);
      const json = (data, status = 200) => ({ ok: status < 300, status, json: async () => data });
      if (path.startsWith("git/ref/")) return json({ object: { sha: "parent" } });
      if (path.startsWith("contents/")) return remoteText == null ? json({ message: "Not Found" }, 404) : json({ content: b64(remoteText) });
      if (path.startsWith("git/commits/")) return json({ tree: { sha: "tree0" } });
      if (path === "git/blobs") return json({ sha: "blob1" });
      if (path === "git/trees") return json({ sha: "tree1", body: JSON.parse(body) });
      if (path === "git/commits") return json({ sha: "c1", html_url: "https://github.com/o/r/commit/c1" });
      if (path.startsWith("git/refs/")) return json({});
      return json({}, 500);
    });
    return { calls, fetchImpl };
  }

  it("makes one commit with every changed file", async () => {
    const { calls, fetchImpl } = fakeGitHub('{\n  "id": "x",\n  "items": []\n}\n');
    const result = await publishToGitHub({ token: "t", repo: "o/r", branch: "master", files: [file], message: "m", fetchImpl });
    expect(result).toEqual({ sha: "c1", url: "https://github.com/o/r/commit/c1" });
    expect(calls).toEqual([
      "GET git/ref/heads/master",
      "GET contents/packs/x.json",
      "GET git/commits/parent",
      "POST git/blobs",
      "POST git/trees",
      "POST git/commits",
      "PATCH git/refs/heads/master",
    ]);
  });

  it("refuses to overwrite a file someone else changed", async () => {
    const { calls, fetchImpl } = fakeGitHub('{"id":"x","items":["theirs"]}');
    await expect(publishToGitHub({ token: "t", repo: "o/r", branch: "master", files: [file], message: "m", fetchImpl }))
      .rejects.toBeInstanceOf(PublishConflict);
    expect(calls).not.toContain("POST git/commits");
  });
});
