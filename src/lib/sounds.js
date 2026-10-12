// Small sound effects, synthesised with the Web Audio API so there are no
// files to load. Every sound is short and soft: a reward, never a buzzer.
// Turned on or off from Settings (see SettingsContext); silent where the
// browser has no Web Audio.

let enabled = true;
let ctx = null;

export function setSoundEnabled(on) {
  enabled = Boolean(on);
}

function audio() {
  if (!enabled || typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume?.();
  return ctx;
}

// One note: `freq` Hz (or [from, to] for a glide), starting `at` seconds from now.
function note(ac, { freq, at = 0, length = 0.18, type = "sine", volume = 0.12 }) {
  const start = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  const [from, to] = Array.isArray(freq) ? freq : [freq, freq];
  osc.frequency.setValueAtTime(from, start);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, start + length);
  // Quick attack, soft bell-like fade.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

function play(notes) {
  const ac = audio();
  if (!ac) return;
  try {
    notes.forEach((n) => note(ac, n));
  } catch {
    // a sound never gets in the way of the game
  }
}

// C major, around the middle of the piano so nothing is shrill.
const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5;

export const sounds = {
  // A right answer: two rising notes.
  correct: () => play([
    { freq: E5, length: 0.16 },
    { freq: A5, at: 0.09, length: 0.32 },
  ]),
  // A letter found in hangman; `n` letters found so far makes it climb a little.
  found: (n = 0) => play([{ freq: C5 * Math.pow(2, Math.min(n, 7) / 12), length: 0.12, type: "triangle", volume: 0.1 }]),
  // A miss: a low, soft "boop", not a buzzer.
  miss: () => play([{ freq: [260, 200], length: 0.18, type: "triangle", volume: 0.09 }]),
  // The answer was shown after the tries ran out: calm and neutral.
  shown: () => play([
    { freq: G5, length: 0.18, volume: 0.08 },
    { freq: E5, at: 0.12, length: 0.3, volume: 0.08 },
  ]),
  // Tapping a word chip into place.
  tap: () => play([{ freq: 1200, length: 0.05, type: "triangle", volume: 0.05 }]),
  // A finished round, daily goal, level up or streak: a short arpeggio.
  celebrate: () => play([
    { freq: C5, length: 0.2 },
    { freq: E5, at: 0.1, length: 0.2 },
    { freq: G5, at: 0.2, length: 0.2 },
    { freq: C6, at: 0.3, length: 0.5, volume: 0.14 },
  ]),
};
