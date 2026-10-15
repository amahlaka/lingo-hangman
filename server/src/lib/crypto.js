import crypto from "node:crypto";

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

export const sha256 = (value) => crypto.createHash("sha256").update(value).digest("base64url");

// Six digits, evenly distributed.
export const sixDigitCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

// Compares two strings in constant time (for code hashes).
export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
