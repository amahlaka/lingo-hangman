// A small in-memory sliding-window limiter. One API process serves the app,
// so memory is enough; limits reset when the container restarts.

export function createRateLimiter() {
  const hits = new Map();

  // True if `key` may act again: fewer than `max` hits in the last `windowMs`.
  function allow(key, max, windowMs, now = Date.now()) {
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  }

  // Drop keys with nothing recent, so the map can't grow without bound.
  function sweep(maxWindowMs, now = Date.now()) {
    for (const [key, times] of hits) {
      if (!times.some((t) => now - t < maxWindowMs)) hits.delete(key);
    }
  }

  return { allow, sweep, size: () => hits.size };
}
