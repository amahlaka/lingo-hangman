// How long a round is. A game card's round menu (src/components/lingo/GameCard.jsx)
// opens a game with `?rounds=N`; the game reads it with useRounds() and falls
// back to its usual length without it, so a plain tap plays as before.
// "Play again" keeps the address, so the next round is as long.
import { useSearchParams } from "react-router-dom";

// What the menu offers: a round is a word or a question unless the registry
// entry says otherwise (`rounds: { options, unit, path? }`, or `rounds: false` for a
// game with a fixed length, such as Daily word).
export const DEFAULT_ROUNDS = { options: [1, 5, 10], unit: "round" };

export function roundChoices(game) {
  if (!game || game.soon || game.rounds === false) return null;
  return game.rounds || DEFAULT_ROUNDS;
}

// The address that plays `game` with `n` rounds (`rounds.path` when the card
// itself opens a menu page, such as the Sounds of English lesson list).
export function roundsPath(game, n) {
  const base = roundChoices(game)?.path || game.path;
  return `${base}${base.includes("?") ? "&" : "?"}rounds=${n}`;
}

// The asked number of rounds, or `fallback` when none (or a broken one) was asked.
export function roundsFrom(value, fallback, { max = 20 } = {}) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : fallback;
}

export function useRounds(fallback, options) {
  const [params] = useSearchParams();
  return roundsFrom(params.get("rounds"), fallback, options);
}
