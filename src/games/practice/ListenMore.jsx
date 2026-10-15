import React from "react";
import { sentenceFor } from "../../lib/words";
import { speak, speakWords } from "../../lib/speech";

// The extra listening button next to Listen and Listen slowly: a single word
// can be heard in a sentence from the word bank, and a phrase or sentence word
// by word, slowly, with a pause after each word.
export default function ListenMore({ text, lang, p }) {
  if (!text) return null;
  if (text.trim().includes(" ")) {
    return (
      <button type="button" className="lg-btn lg-btn--quiet" onClick={() => speakWords(text, { lang })}>
        {p.listenWordByWord}
      </button>
    );
  }
  if (!sentenceFor(text, lang)) return null;
  return (
    <button type="button" className="lg-btn lg-btn--quiet" onClick={() => speak(sentenceFor(text, lang), { lang })}>
      {p.listenInSentence}
    </button>
  );
}
