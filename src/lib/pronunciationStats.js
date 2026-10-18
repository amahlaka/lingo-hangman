// Pronunciation numbers from Say it right's answers, shared by the app (what
// an answer records) and the API (admin statistics, a learner's own view, the
// MCP tools). No imports, so the API's image can copy it as it is.
//
// A Say it right answer carries, besides the usual fields:
//   score   0-100, the best try's score
//   mode    "words" or "read" (Read aloud)
//   phones  { [IPA sound]: [seen, missed, nearly] } over every try of the
//           question, e.g. { "θ": [2, 2, 0], "æ": [2, 0, 1] }
//   wpm     Read aloud only: the best reading's words a minute

export const PRONOUNCE_GAME = "say-right";
export const PRONOUNCE_MODES = ["words", "read"];
// At most this many sounds are kept on one answer.
const MAX_PHONES = 60;
const SYMBOL = /^[^\s/[\]]{1,4}$/u;

// The answer fields for scored tries ([{ sounds: [{ symbol, status }] }]).
export function phoneCounts(tries) {
  const out = {};
  for (const t of tries || []) {
    for (const s of t?.sounds || []) {
      const c = out[s.symbol] || (out[s.symbol] = [0, 0, 0]);
      c[0] += 1;
      if (s.status === "miss") c[1] += 1;
      if (s.status === "close") c[2] += 1;
    }
  }
  return out;
}

const count = (v) => Number.isInteger(v) && v >= 0 && v <= 999;

// The pronunciation fields of an answer as stored, or {} when it has none.
// Used when the API receives answers (src/lib/syncEvents.js).
export function cleanPronunciation(r) {
  const out = {};
  if (Number.isInteger(r?.score) && r.score >= 0 && r.score <= 100) out.score = r.score;
  if (PRONOUNCE_MODES.includes(r?.mode)) out.mode = r.mode;
  if (Number.isInteger(r?.wpm) && r.wpm > 0 && r.wpm <= 600) out.wpm = r.wpm;
  if (r?.phones && typeof r.phones === "object" && !Array.isArray(r.phones)) {
    const phones = {};
    for (const [symbol, c] of Object.entries(r.phones).slice(0, MAX_PHONES)) {
      if (!SYMBOL.test(symbol) || !Array.isArray(c) || c.length !== 3 || !c.every(count)) continue;
      if (c[1] + c[2] > c[0]) continue;
      phones[symbol] = c;
    }
    if (Object.keys(phones).length) out.phones = phones;
  }
  return out;
}

const round1 = (n) => Math.round(n * 10) / 10;
const share = (a, b) => (b ? Math.round((a / b) * 100) / 100 : 0);

// A running total of scored answers: add(result, learner?) for each answer,
// then summary(). `learner` (any id) lets the totals count learners, so the
// admin statistics can leave out sounds and words only one or two learners had.
export function pronunciationTotals() {
  const modes = new Map(); // mode -> { n, score, learners:Set, wpm[] }
  const sounds = new Map(); // symbol -> { seen, missed, close, learners:Set }
  const items = new Map(); // word -> { word, mode, n, score, learners:Set }
  let answers = 0;
  return {
    add(result, learner = null) {
      // A word skipped before any try has no sounds and says nothing.
      if (result?.gameId !== PRONOUNCE_GAME || !Number.isInteger(result.score) || !Object.keys(result.phones || {}).length) return;
      answers += 1;
      const mode = result.mode || "words";
      const m = modes.get(mode) || { n: 0, score: 0, learners: new Set(), wpm: [] };
      m.n += 1;
      m.score += result.score;
      if (learner !== null) m.learners.add(learner);
      if (result.wpm) m.wpm.push(result.wpm);
      modes.set(mode, m);
      for (const [symbol, [seen, missed, close]] of Object.entries(result.phones || {})) {
        const s = sounds.get(symbol) || { seen: 0, missed: 0, close: 0, learners: new Set() };
        s.seen += seen;
        s.missed += missed;
        s.close += close;
        if (learner !== null) s.learners.add(learner);
        sounds.set(symbol, s);
      }
      if (result.word) {
        const it = items.get(result.word) || { word: result.word, mode, n: 0, score: 0, learners: new Set() };
        it.n += 1;
        it.score += result.score;
        if (learner !== null) it.learners.add(learner);
        items.set(result.word, it);
      }
    },
    // { answers, modes: [{ mode, answers, learners, average, wpm }], sounds:
    // [{ symbol, seen, missed, close, rate, learners }] weakest first, items:
    // [{ word, mode, answers, learners, average }] lowest average first }.
    // minLearners / minAnswers leave out what too few learners had.
    summary({ minLearners = 0, minAnswers = 0, minSeen = 3, max = 25 } = {}) {
      const median = (list) => {
        if (!list.length) return null;
        const s = [...list].sort((a, b) => a - b);
        return s[s.length >> 1];
      };
      return {
        answers,
        modes: [...modes].map(([mode, m]) => ({
          mode, answers: m.n, learners: m.learners.size, average: round1(m.score / m.n), wpm: median(m.wpm),
        })),
        sounds: [...sounds]
          .filter(([, s]) => s.seen >= minSeen && s.learners.size >= minLearners)
          .map(([symbol, s]) => ({
            symbol, seen: s.seen, missed: s.missed, close: s.close, rate: share(s.missed + s.close / 2, s.seen), learners: s.learners.size,
          }))
          .sort((a, b) => b.rate - a.rate || b.seen - a.seen)
          .slice(0, max),
        items: [...items.values()]
          .filter((it) => it.n >= minAnswers && it.learners.size >= minLearners)
          .map((it) => ({ word: it.word, mode: it.mode, answers: it.n, learners: it.learners.size, average: round1(it.score / it.n) }))
          .sort((a, b) => a.average - b.average || b.answers - a.answers)
          .slice(0, max),
      };
    },
  };
}
