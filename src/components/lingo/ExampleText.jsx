import React from "react";

// Explanation text from the word base, where English examples are written
// between asterisks: "Kun sana alkaa kirjaimilla *kn*, *k* jätetään sanomatta."
// The marked parts are shown in colour and bold, in English. An unpaired
// asterisk is shown as it is.
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
      <React.Fragment key={i}>{part.text}</React.Fragment>
    )
  );
}
