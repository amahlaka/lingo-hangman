// Pure helpers for scoring pronunciation: compare the sounds a phoneme
// recogniser heard (the Talkies `zipa-ipa` model, which returns IPA phones
// separated by spaces and never corrects them toward a real word) with a word
// bank item's US IPA. No React here; used by "Say it right".
//
// Both sides are brought to the same plain phones first: stress, length and
// small marks go, r-coloured vowels become a vowel and r, and diphthongs and
// tš-like sounds become their two parts, because the recogniser writes them
// that way ("a ɪ", "t ʃ"). The phones are then lined up with a weighted edit
// distance in which near sounds (ɪ and i, e and ɛ, the quick US t and d) cost
// little and the sounds Finnish speakers mix up (th and t, w and v) cost in full.

// Sounds written with more than one character in the word bank's IPA, kept
// together as one sound in the feedback. Longest first.
const SEGMENTS = ["t̬", "tʃ", "dʒ", "eɪ", "aɪ", "ɔɪ", "aʊ", "oʊ"];

// Marks that don't change which sound it is, for scoring.
const DROP = /[ˈˌːˑ.‿͡ʰʲʷˠ̥̩̯̪̺̻̹̜̟̠̃̊̈̽̚ʔ]/gu;

// One character of IPA to the plain phones it is compared as.
const PLAIN = {
  ɹ: ["r"], ɻ: ["r"], ʀ: ["r"], ʁ: ["r"], "˞": ["r"],
  ɚ: ["ə", "r"], ɝ: ["ɜ", "r"],
  ɡ: ["g"], ɐ: ["ə"], ᵻ: ["ɪ"], ᵿ: ["ʊ"], ɨ: ["ɪ"], ʉ: ["u"],
  ɫ: ["l"], ʟ: ["l"], ɬ: ["l"],
  ä: ["a"], ɑ: ["ɑ"], ɒ: ["ɑ"],
  y: ["i"],
  ç: ["h"], x: ["h"],
};

// Groups of sounds that are near each other, with the cost of saying one for
// another (0: as good as the same, 1: a different sound).
const NEAR = [
  [["ɾ", "t", "d"], 0], // the quick US t in water, better
  [["e", "ɛ"], 0.1],
  [["ʌ", "ə", "ɜ"], 0.2],
  [["ʌ", "a"], 0.4],
  [["ɑ", "a", "ɔ"], 0.3],
  [["o", "ɔ"], 0.3],
  [["æ", "ɛ", "a"], 0.5],
  [["i", "ɪ", "e"], 0.5],
  [["u", "ʊ", "o"], 0.5],
  [["ə", "ɪ", "ʊ", "ɛ"], 0.45], // weak vowels
  [["i", "j"], 0.5],
  [["u", "w"], 0.5],
  [["n", "ŋ"], 0.6],
  [["m", "n"], 0.8],
  // Voiced and voiceless partners: right place, wrong buzz.
  [["p", "b"], 0.6],
  [["t", "d"], 0.6],
  [["k", "g"], 0.6],
  [["s", "z"], 0.6],
  [["f", "v"], 0.6],
  [["θ", "ð"], 0.4],
  [["ʃ", "ʒ"], 0.5],
  [["s", "ʃ"], 0.7],
];

// Extra sounds the recogniser heard (a breath, a small ə at the end) cost less
// than missing ones.
const EXTRA_COST = 0.35;
const MISSING_COST = 1;

const nearCost = new Map();
for (const [group, cost] of NEAR) {
  for (const a of group) {
    for (const b of group) {
      if (a === b) continue;
      const key = `${a}|${b}`;
      nearCost.set(key, Math.min(nearCost.get(key) ?? 1, cost));
    }
  }
}

export function phoneCost(a, b) {
  if (a === b) return 0;
  return nearCost.get(`${a}|${b}`) ?? 1;
}

// One IPA character (or the t̬ pair) to plain phones; [] for marks.
function plainPhones(symbol) {
  if (symbol === "t̬") return ["ɾ"];
  const out = [];
  for (const ch of symbol.normalize("NFD").replace(DROP, "")) {
    if (/[\s/[\]()]/.test(ch)) continue;
    if (/\p{M}/u.test(ch)) continue;
    out.push(...(PLAIN[ch] || [ch]));
  }
  return out;
}

// A word bank IPA ("/ˈwɑːt̬ɚ/", "/ˈhaʊ ˈmʌtʃ/") to the sounds shown in the
// feedback: [{ text: "ˈw", phones: ["w"], word: 0 }, ...]. `text` is what is
// shown (stress and length marks stay on their sound), `phones` what is scored.
export function ipaSounds(ipa) {
  const words = String(ipa || "")
    .replace(/^\s*\/|\/\s*$/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const sounds = [];
  words.forEach((word, w) => {
    let i = 0;
    let lead = "";
    const chars = [...word.normalize("NFC")];
    while (i < chars.length) {
      const ch = chars[i];
      if (ch === "ˈ" || ch === "ˌ") {
        lead += ch;
        i += 1;
        continue;
      }
      const rest = chars.slice(i).join("");
      let seg = SEGMENTS.find((s) => rest.startsWith(s)) || ch;
      i += [...seg].length;
      // Length marks and combining marks belong to the sound before them.
      while (i < chars.length && (chars[i] === "ː" || /\p{M}/u.test(chars[i]))) {
        seg += chars[i];
        i += 1;
      }
      const phones = plainPhones(seg);
      if (!phones.length) {
        lead += seg;
        continue;
      }
      sounds.push({ text: lead + seg, symbol: seg.replace(/[ː]/g, ""), phones, word: w });
      lead = "";
    }
  });
  return sounds;
}

// The recogniser's answer ("ð ə w ɛ ð ə ˞") to plain phones.
export function heardPhones(text) {
  return String(text || "")
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((tok) => plainPhones(tok));
}

// Line the expected phones up with the heard ones. Returns, for every expected
// phone, the cost of how it was said (0 right … 1 missing or another sound),
// and the total cost including extra heard phones.
export function alignPhones(expected, heard) {
  const n = expected.length;
  const m = heard.length;
  // d[i][j]: cost of the first i expected against the first j heard.
  const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) d[i][0] = i * MISSING_COST;
  for (let j = 1; j <= m; j++) d[0][j] = j * EXTRA_COST;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(
        d[i - 1][j - 1] + phoneCost(expected[i - 1], heard[j - 1]),
        d[i - 1][j] + MISSING_COST,
        d[i][j - 1] + EXTRA_COST
      );
    }
  }
  // Walk back to find what each expected phone was matched with.
  const costs = new Array(n).fill(MISSING_COST);
  const matched = new Array(n).fill(null);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const sub = d[i - 1][j - 1] + phoneCost(expected[i - 1], heard[j - 1]);
    if (Math.abs(d[i][j] - sub) < 1e-9) {
      costs[i - 1] = phoneCost(expected[i - 1], heard[j - 1]);
      matched[i - 1] = heard[j - 1];
      i -= 1;
      j -= 1;
    } else if (Math.abs(d[i][j] - (d[i - 1][j] + MISSING_COST)) < 1e-9) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  return { costs, matched, total: d[n][m] };
}

// A sound's result: "ok" (said right), "close" (nearly) or "miss".
export function soundStatus(cost) {
  if (cost < 0.25) return "ok";
  if (cost < 0.75) return "close";
  return "miss";
}

// Score how `heard` (the recogniser's IPA) matches the word bank `ipa`.
// { score: 0-100, sounds: [{ text, symbol, word, cost, status, heard }], heard, nothing }.
// `heard` on a sound is what the recogniser heard in its place ("" for nothing).
export function scorePronunciation(ipa, heard) {
  const sounds = ipaSounds(ipa);
  const expected = sounds.flatMap((s) => s.phones);
  const got = heardPhones(heard);
  if (!expected.length) return { score: 0, sounds: [], heard: got.join(" "), nothing: !got.length };
  if (!got.length) {
    return { score: 0, sounds: sounds.map((s) => ({ ...s, cost: MISSING_COST, status: "miss", heard: "" })), heard: "", nothing: true };
  }
  const { costs, matched, total } = alignPhones(expected, got);
  let k = 0;
  const scored = sounds.map((s) => {
    const own = costs.slice(k, k + s.phones.length);
    const said = matched.slice(k, k + s.phones.length).filter(Boolean).join("");
    k += s.phones.length;
    const cost = own.reduce((a, b) => a + b, 0) / own.length;
    return { ...s, cost, status: soundStatus(cost), heard: said };
  });
  const score = Math.round(100 * Math.max(0, 1 - total / expected.length));
  return { score, sounds: scored, heard: got.join(" "), nothing: false };
}

// The sounds of a result worth practising: missed first, then close ones,
// each symbol once. [{ symbol, status }].
export function soundsToPractise(result) {
  const seen = new Set();
  const out = [];
  for (const status of ["miss", "close"]) {
    for (const s of result?.sounds || []) {
      if (s.status !== status || seen.has(s.symbol)) continue;
      seen.add(s.symbol);
      out.push({ symbol: s.symbol, status });
    }
  }
  return out;
}

// The plain phones of a tip's symbol ("tʃ", "θ"), for matching a sound to its tip.
export function symbolKey(symbol) {
  return plainPhones(String(symbol || "").replace(/ː/g, "")).join("");
}
