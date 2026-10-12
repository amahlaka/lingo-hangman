import React from "react";

// The word being guessed, one tile per letter.
// tiles: [{ char, state }] where state is "empty" | "found" | "solved" | "revealed" | "space" | "fixed".
// "fixed" is a character that isn't guessed (punctuation, digits); it shows as found.
// popKeys: indexes of tiles that were just revealed, to play the small celebration.
export default function WordTiles({ tiles, win = false, label, hint, popKeys = [], maxPerLine = 12 }) {
  // Break long phrases into lines at spaces so a word never wraps mid-word.
  const lines = [];
  let line = [];
  let len = 0;
  tiles.forEach((tile, i) => {
    if (tile.state === "space" && len >= maxPerLine) {
      lines.push(line);
      line = [];
      len = 0;
      return;
    }
    line.push({ ...tile, i });
    len++;
  });
  if (line.length) lines.push(line);

  return (
    <div className="lg-word">
      <div className="lg-word__lines" aria-label={label} role="img">
        {lines.map((ln, li) => (
          <div key={li} className={`lg-tiles ${win ? "lg-tiles--win" : ""}`}>
            {ln.map(({ char, state, i }) => {
              const cls = ["lg-tile"];
              if (state === "found" || state === "fixed") cls.push("lg-tile--found");
              if (state === "solved") cls.push("lg-tile--solved");
              if (state === "revealed") cls.push("lg-tile--revealed");
              if (state === "space") cls.push("lg-tile--space");
              if (popKeys.includes(i)) cls.push("lg-pop");
              const shown = state === "empty" || state === "space" ? "" : char;
              return (
                <span key={i} className={cls.join(" ")} style={{ "--i": win ? i : 0 }} data-testid={`letter-${i}`} aria-hidden="true">
                  {shown}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      {hint && <p className="lg-hint">{hint}</p>}
    </div>
  );
}
