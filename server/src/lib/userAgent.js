// "Chrome on Windows" from a User-Agent header, for naming sessions and
// passkeys. Rough on purpose: only the browser and system families.

const BROWSERS = [
  ["Edge", /Edg(e|A|iOS)?\//],
  ["Opera", /OPR\//],
  ["Samsung Internet", /SamsungBrowser\//],
  ["Firefox", /(Firefox|FxiOS)\//],
  ["Chrome", /(Chrome|CriOS)\//],
  ["Safari", /Version\/[\d.]+.*Safari\//],
];

const SYSTEMS = [
  ["iPhone", /iPhone/],
  ["iPad", /iPad/],
  ["Android", /Android/],
  ["Windows", /Windows/],
  ["macOS", /Mac OS X|Macintosh/],
  ["ChromeOS", /CrOS/],
  ["Linux", /Linux/],
];

export function describeDevice(ua = "") {
  const browser = BROWSERS.find(([, re]) => re.test(ua))?.[0];
  const system = SYSTEMS.find(([, re]) => re.test(ua))?.[0];
  if (browser && system) return `${browser} on ${system}`;
  return browser || system || "Unknown device";
}
