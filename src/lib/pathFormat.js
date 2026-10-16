// The stored form of a "My path" plan (src/lib/path.js), shared with the
// API (server/src/routes/path.js), which keeps one per account. No imports,
// so the server can load it.

export const PATH_VERSION = 1;
export const STEP_ANSWERS = 10;
export const PATH_REASONS = ["placement", "start", "practise", "new", "strength"];

// A path as stored or sent: only known fields, sane numbers.
export function cleanPath(p) {
  if (!p || typeof p !== "object" || p.v !== PATH_VERSION || !Array.isArray(p.steps)) return null;
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (!day.test(p.week) || !day.test(p.planned)) return null;
  const steps = p.steps.slice(0, 6).map((s) => ({
    game: String(s?.game || "").slice(0, 40),
    skill: String(s?.skill || "").slice(0, 40),
    reason: PATH_REASONS.includes(s?.reason) ? s.reason : "practise",
    goal: Math.max(1, Math.min(50, Math.floor(Number(s?.goal) || STEP_ANSWERS))),
    base: Math.max(0, Math.floor(Number(s?.base) || 0)),
  }));
  if (!steps.length || steps.some((s) => !/^[a-z-]+$/.test(s.game))) return null;
  return { v: PATH_VERSION, week: p.week, planned: p.planned, placement: Boolean(p.placement), steps };
}
