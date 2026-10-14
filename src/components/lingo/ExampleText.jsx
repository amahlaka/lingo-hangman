import React from "react";
import Term, { splitTerms } from "./Term";

// Explanation text from the word base, where English examples are written
// between asterisks: "Kun sana alkaa kirjaimilla *kn*, *k* jätetään sanomatta."
// The marked parts are shown in colour and bold, in English. An unpaired
// asterisk is shown as it is. Words like "vowel" and "konsonantti" outside the
// examples are underlined and show which letters they mean (see Term).
export function splitExamples(text) {
  const parts = text.split("*");
  if (parts.length % 2 === 0) return [{ text }];
  return parts.map((t, i) => ({ text: t, example: i % 2 === 1 })).filter((p) => p.text);
}

// The text without its asterisks, for places that show plain text.
export function plainText(text) {
  return splitExamples(text).map((p) => p.text).join("");
}

export default function ExampleText({ text }) {
  if (!text) return null;
  return splitExamples(text).map((part, i) =>
    part.example ? (
      <mark key={i} className="lg-example" lang="en">{part.text}</mark>
    ) : (
      <React.Fragment key={i}>
        {splitTerms(part.text).map((bit, j) =>
          bit.kind ? (
            <Term key={j} kind={bit.kind} lang={bit.lang}>{bit.text}</Term>
          ) : (
            <React.Fragment key={j}>{bit.text}</React.Fragment>
          )
        )}
      </React.Fragment>
    )
  );
}
