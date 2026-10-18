import { alignPhones, heardPhones, ipaSounds, phoneCost, scorePronunciation, soundsToPractise, symbolKey } from "../lib/phonemes";

const statuses = (r) => r.sounds.map((s) => `${s.text}:${s.status}`).join(" ");

describe("pronunciation scores", () => {
  it("splits word bank IPA into the sounds shown, keeping stress and length on them", () => {
    expect(ipaSounds("/ˈwɑːt̬ɚ/").map((s) => s.text)).toEqual(["ˈw", "ɑː", "t̬", "ɚ"]);
    expect(ipaSounds("/ˈtʃiːz/").map((s) => [s.symbol, s.phones.join("")])).toEqual([["tʃ", "tʃ"], ["i", "i"], ["z", "z"]]);
    expect(ipaSounds("/ˈhaʊ ˈmʌtʃ/").map((s) => s.word)).toEqual([0, 0, 1, 1, 1]);
    expect(ipaSounds("")).toEqual([]);
  });

  it("reads the recogniser's phones the same way", () => {
    expect(heardPhones("ð ə w ɛ ð ə ˞")).toEqual(["ð", "ə", "w", "ɛ", "ð", "ə", "r"]);
    expect(heardPhones("ɹ ɡ tʃ")).toEqual(["r", "g", "t", "ʃ"]);
  });

  it("gives full marks for the expected sounds, US t and r-vowels included", () => {
    expect(scorePronunciation("/ˈwɑːt̬ɚ/", "w ɑ ɾ ə ˞").score).toBe(100);
    expect(scorePronunciation("/ˈwɑːt̬ɚ/", "w ɑ d ɚ").score).toBe(100);
    expect(scorePronunciation("/naɪs/", "n a ɪ s").score).toBe(100);
    expect(scorePronunciation("/ˈhaʊ ˈmʌtʃ ɪz ˈðɪs/", "h a ʊ m ʌ t ʃ ɪ z ð ɪ s").score).toBe(100);
  });

  it("marks the typical Finnish mix-ups as sounds to practice", () => {
    const three = scorePronunciation("/θriː/", "t r i");
    expect(statuses(three)).toBe("θ:miss r:ok iː:ok");
    expect(three.score).toBe(67);
    const very = scorePronunciation("/ˈveri/", "w e r i");
    expect(very.sounds[0].status).toBe("miss");
    expect(soundsToPractise(very)).toEqual([{ symbol: "v", status: "miss" }]);
  });

  it("is kinder to near sounds than to other sounds", () => {
    expect(phoneCost("ɪ", "i")).toBeLessThan(phoneCost("θ", "t"));
    expect(phoneCost("s", "z")).toBeLessThan(1);
    expect(scorePronunciation("/ʃɪp/", "ʃ i p").score).toBeGreaterThan(scorePronunciation("/ʃɪp/", "s ɪ p").score - 20);
    expect(scorePronunciation("/ʃɪp/", "ʃ i p").sounds[1].status).toBe("close");
  });

  it("scores silence and other words low", () => {
    expect(scorePronunciation("/kɑːr/", "")).toMatchObject({ score: 0, nothing: true });
    expect(scorePronunciation("/kɑːr/", "m u n l ɪ t").score).toBeLessThan(30);
  });

  it("costs little for a breath before or after the word", () => {
    expect(scorePronunciation("/ˈdɑːɡ/", "h d ɑ g ə").score).toBeGreaterThanOrEqual(75);
  });

  it("lines every expected phone up with what was heard", () => {
    expect(alignPhones(["θ", "r", "i"], ["t", "r", "i"]).matched).toEqual(["t", "r", "i"]);
    expect(alignPhones(["k", "æ", "t"], ["k", "t"]).costs).toEqual([0, 1, 0]);
  });

  it("matches tip symbols to sounds", () => {
    expect(symbolKey("iː")).toBe(symbolKey("i"));
    expect(symbolKey("ɚ")).toBe("ər");
    expect(symbolKey("t̬")).toBe("ɾ");
  });
});
