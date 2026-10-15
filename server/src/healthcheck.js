// Docker HEALTHCHECK: exits 0 when /api/health answers ok. The image has no
// curl or wget, so this uses Node's own fetch.
const port = process.env.PORT || 3000;
try {
  const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) });
  const body = await res.json();
  process.exit(res.ok && body.ok ? 0 : 1);
} catch {
  process.exit(1);
}
