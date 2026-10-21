import React from "react";
import englishLayout from "./keyboardLayouts/english";
import finnishLayout from "./keyboardLayouts/finnish";

function getKeyboardRows(alphabet, lang) {
  if (lang === "en" || lang === "en-GB") return englishLayout;
  if (lang === "fi") return finnishLayout;
  const rows = [];
  for (let i = 0; i < alphabet.length; i += 10) rows.push(alphabet.slice(i, i + 10));
  return rows;
}

// On-screen keyboard with Lingo LetterKey states:
// hit (pine), miss (cloudberry outline and strike), removed by a hint (dashed),
// highlighted by 50-50 (lake). The last missed key wobbles.
export default function HangmanKeyboard({
  alphabet,
  lang,
  guesses,
  inWord,
  removed,
  highlighted,
  lastMiss,
  disabled,
  onGuess,
  t,
}) {
  const rows = getKeyboardRows(alphabet, lang);
  return (
    <div className="hm-keyboard" style={{ touchAction: "manipulation" }}>
      {rows.map((row, r) => (
        <div key={r} className="hm-keyboard__row">
          {row.map((l) => {
            const guessed = guesses.includes(l);
            const hit = guessed && inWord(l);
            const miss = guessed && !hit;
            const isRemoved = removed.includes(l);
            const cls = ["lg-key"];
            if (hit) cls.push("lg-key--hit");
            if (miss) cls.push("lg-key--miss");
            if (isRemoved) cls.push("lg-key--removed");
            if (highlighted.includes(l)) cls.push("lg-key--hint");
            if (miss && lastMiss === l) cls.push("lg-wobble");
            if (hit && guesses[guesses.length - 1] === l) cls.push("lg-pop");
            let label = l;
            if (hit) label = `${l}, ${t.inWord}`;
            else if (miss) label = `${l}, ${t.notInWord}`;
            else if (isRemoved) label = `${l}, ${t.removedKey}`;
            return (
              <button
                key={l}
                type="button"
                className={cls.join(" ")}
                disabled={guessed || isRemoved || disabled}
                aria-label={label}
                onClick={() => onGuess(l)}
              >
                {l}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
