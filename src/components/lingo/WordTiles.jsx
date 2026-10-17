import React from "react";

// The word being guessed, one tile per letter.
// tiles: [{ char, state }] where state is "empty" | "found" | "solved" | "revealed" | "space" | "fixed".
// "fixed" is a character that isn't guessed (punctuation, digits); it shows as found.
// popKeys: indexes of tiles that were just revealed, to play the small celebration.
export default function WordTiles({ tiles, win = false, label, hint, popKeys = [] }) {
  // Each word is one unbreakable group, so lines only ever break between
  // words: the word's shape is the main clue. The tiles shrink to fit the
  // longest word on one line (see .lg-word in app.css).
  const words = [];
  let word = [];
  tiles.forEach((tile, i) => {
    if (tile.state === "space") {
      if (word.length) words.push(word);
      word = [];
      return;
    }
    word.push({ ...tile, i });
  });
  if (word.length) words.push(word);
  const longest = Math.max(1, ...words.map((w) => w.length));
  // A long sentence gets smaller tiles so it fits in fewer lines.
  const letters = words.reduce((n, w) => n + w.length, 0);
  const max = letters > 30 ? 32 : letters > 18 ? 38 : 44;

  return (
    <div className="lg-word" style={{ "--tiles": longest, "--tile-max": `${max}px` }}>
      <div className={`lg-word__lines ${win ? "lg-tiles--win" : ""}`} aria-label={label} role="img">
        {words.map((w) => (
          <span key={w[0].i} className="lg-tiles lg-tiles__word">
            {w.map(({ char, state, i }) => {
              const cls = ["lg-tile"];
              if (state === "found" || state === "fixed") cls.push("lg-tile--found");
              if (state === "solved") cls.push("lg-tile--solved");
              if (state === "revealed") cls.push("lg-tile--revealed");
              if (popKeys.includes(i)) cls.push("lg-pop");
              const shown = state === "empty" ? "" : char;
              return (
                <span key={i} className={cls.join(" ")} style={{ "--i": win ? i : 0 }} data-testid={`letter-${i}`} aria-hidden="true">
                  {shown}
                </span>
              );
            })}
          </span>
        ))}
      </div>
      {hint && <p className="lg-hint">{hint}</p>}
    </div>
  );
}
