import React from "react";
import { ArrowDown, Lightbulb, Volume2 } from "lucide-react";
import { ExampleText } from "../components/lingo";
import { TypedSentence } from "../games/phrase/SentenceRules";
import { typedExamples } from "../lib/wordTypes";
import { SYLLABLE_MARK } from "../lib/contentSchema";
import { canSpeak, speak } from "../lib/speech";

// The blocks a textbook lesson is made of (the word base's "lesson" items,
// format in its AUTHORING.md). Most draw the rule rather than describe it:
// letter tables, "which spelling?" charts, side-by-side comparisons, stress
// blocks and sentences shown word by word. English words are tap-to-hear.

// "ba[ck]" -> [{ text: "ba" }, { text: "ck", marked: true }]; any number of marks.
export function splitMarks(text) {
  return String(text)
    .split(/(\[[^[\]]*\])/)
    .filter(Boolean)
    .map((part) => (part.startsWith("[") && part.endsWith("]") ? { text: part.slice(1, -1), marked: true } : { text: part }));
}

// The words as said: no marks, no syllable dots.
export function plainWords(text) {
  return String(text).replace(/[[\]]/g, "").split(SYLLABLE_MARK).join("");
}

function Marked({ text, silent = false, lang = "en" }) {
  return (
    <span lang={lang}>
      {splitMarks(text).map((part, i) =>
        part.marked ? (
          <span key={i} className={silent ? "snd-mark snd-mark--silent" : "snd-mark"}>{part.text}</span>
        ) : (
          <React.Fragment key={i}>{part.text}</React.Fragment>
        )
      )}
    </span>
  );
}

// An English word or phrase that plays when tapped.
function Hear({ text, silent, className = "", children }) {
  const speech = canSpeak();
  return (
    <button
      type="button"
      className={`ls-hear ${className}`}
      onClick={() => speak(plainWords(text), { lang: "en" })}
      disabled={!speech}
      aria-label={plainWords(text)}
    >
      {speech && <Volume2 size={16} strokeWidth={2} aria-hidden="true" />}
      {children || <Marked text={text} silent={silent} />}
    </button>
  );
}

function WordChips({ words, silent }) {
  return (
    <div className="ls-chips">
      {words.map((w) => (
        <Hear key={w} text={w} silent={silent} />
      ))}
    </div>
  );
}

const pick = (map, lang) => (map ? map[lang] || map.en : "");

function Caption({ text, lang }) {
  if (!text) return null;
  return (
    <p className="lg-caption ls-caption" lang={lang}>
      <ExampleText text={pick(text, lang)} />
    </p>
  );
}

function TextBlock({ block, lang }) {
  return (
    <p className="lg-body-lg ls-text" lang={lang}>
      <ExampleText text={pick(block.text, lang)} />
    </p>
  );
}

function RememberBlock({ block, lang, l }) {
  return (
    <aside className="ls-remember" lang={lang}>
      <span className="ls-remember__icon" aria-hidden="true"><Lightbulb size={22} strokeWidth={2} /></span>
      <div>
        <p className="ls-remember__title">{l.remember}</p>
        <p className="ls-remember__text"><ExampleText text={pick(block.text, lang)} /></p>
      </div>
    </aside>
  );
}

function WordsBlock({ block, lang }) {
  return (
    <figure className="ls-figure">
      <WordChips words={block.words} />
      <Caption text={block.caption} lang={lang} />
    </figure>
  );
}

// A table: the letters big on the left, what they sound like, example words.
function LettersBlock({ block, lang }) {
  return (
    <div className="ls-letters" role="list">
      {block.rows.map((row) => (
        <div key={row.letters} className="ls-letters__row" role="listitem">
          <span className={`ls-letters__tile${block.silent ? " ls-letters__tile--silent" : ""}`} lang="en">{row.letters}</span>
          <div className="ls-letters__body">
            <p className="ls-letters__sound" lang={lang}><ExampleText text={pick(row.sound, lang)} /></p>
            <WordChips words={row.words} silent={block.silent} />
          </div>
        </div>
      ))}
    </div>
  );
}

// "Which spelling?": the question on top, a branch for each answer, each
// ending in the spelling or sound it leads to and words that show it.
function ChoiceBlock({ block, lang }) {
  return (
    <figure className="ls-choice">
      <p className="ls-choice__question" lang={lang}><ExampleText text={pick(block.question, lang)} /></p>
      <div className={`ls-choice__branches ls-choice__branches--${block.options.length}`}>
        {block.options.map((opt, i) => {
          const result = typeof opt.result === "string" ? opt.result : pick(opt.result, lang);
          return (
            <div key={i} className="ls-choice__branch">
              <p className="ls-choice__answer" lang={lang}><ExampleText text={pick(opt.answer, lang)} /></p>
              <ArrowDown className="ls-choice__arrow" size={22} strokeWidth={2.5} aria-hidden="true" />
              <p className="ls-choice__result" lang={typeof opt.result === "string" ? "en" : lang}>{result}</p>
              <WordChips words={opt.words} />
            </div>
          );
        })}
      </div>
    </figure>
  );
}

// Two columns side by side, like Finnish and English, or without and with an e.
function CompareBlock({ block, lang }) {
  return (
    <figure className="ls-figure">
      <div className="ls-compare">
        {block.columns.map((col, i) => (
          <div key={i} className={`ls-compare__col ls-compare__col--${i === 0 ? "a" : "b"}`}>
            <p className="ls-compare__title" lang={lang}><ExampleText text={pick(col.title, lang)} /></p>
            <ul className="ls-compare__lines">
              {col.lines.map((line) => (
                <li key={line}>
                  {col.lang === "en" ? <Hear text={line} className="ls-hear--line" /> : <Marked text={line} lang="fi" />}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Caption text={block.caption} lang={lang} />
    </figure>
  );
}

// Each word as a row of syllables; the stressed one is big and dotted.
function StressBlock({ block }) {
  return (
    <div className="ls-stress">
      {block.words.map((word) => (
        <Hear key={word} text={word} className="ls-stress__word">
          <span className="ls-stress__syllables" lang="en">
            {word.split(SYLLABLE_MARK).map((syl, i) => {
              const strong = syl.startsWith("[");
              return (
                <span key={i} className={`ls-syl${strong ? " ls-syl--strong" : ""}`}>
                  {syl.replace(/[[\]]/g, "")}
                </span>
              );
            })}
          </span>
        </Hear>
      ))}
    </div>
  );
}

function SentenceBlock({ block }) {
  const [example] = typedExamples({ examples: [block] });
  if (!example) return null;
  return (
    <figure className="ls-figure sr-figure">
      <TypedSentence example={example} />
      {block.fi && <figcaption className="lg-caption" lang="fi">{block.fi}</figcaption>}
    </figure>
  );
}

const BLOCKS = {
  text: TextBlock,
  remember: RememberBlock,
  words: WordsBlock,
  letters: LettersBlock,
  choice: ChoiceBlock,
  compare: CompareBlock,
  stress: StressBlock,
  sentence: SentenceBlock,
};

// lang: the language the lesson is read in; l: the interface's lesson texts.
export default function LessonBlocks({ blocks, lang, l }) {
  return blocks.map((block, i) => {
    const Block = BLOCKS[block.type];
    return Block ? <Block key={i} block={block} lang={lang} l={l} /> : null;
  });
}
