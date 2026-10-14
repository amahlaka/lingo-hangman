import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { getSentences } from "../../lib/words";
import { canSpeak } from "../../lib/speech";
import PracticeSession from "../practice/PracticeSession";
import { practicePool } from "../practice/practiceLogic";
import { TYPE_SENTENCES, buildTypeRound } from "./typeLogic";
import TypeQuestion from "./TypeQuestion";

// Type it (/type-it): type the English for a Finnish word, and type English
// sentences you hear. Hints (the word's shape, the next letter or word,
// hearing the word) cost some of the round's points.
export default function TypeGame() {
  const [params] = useSearchParams();
  const { t } = useSettings();
  const p = t.practice;
  const search = params.toString();
  const { pairs, sentences, learningLang, nativeLang } = useMemo(() => {
    const pool = practicePool(new URLSearchParams(search));
    // A shared word list is the whole round; its sentences are the dictation.
    const sentenceList = pool.fromLink
      ? pool.pairs
      : getSentences({ learningLang: pool.learningLang, nativeLang: pool.nativeLang, preferences: true });
    return { ...pool, sentences: sentenceList };
  }, [search]);
  const withSound = canSpeak();

  return (
    <PracticeSession
      gameId="type-it"
      title={p.typeName}
      intro={withSound ? p.typeIntro : p.typeIntroWords}
      learningLang={learningLang}
      nativeLang={nativeLang}
      buildQuestions={() => buildTypeRound(pairs, sentences, { sentences: withSound ? TYPE_SENTENCES : 0 })}
      renderQuestion={({ question, done, onDone }) => (
        <TypeQuestion
          question={question}
          done={done}
          onDone={onDone}
          p={p}
          learningLang={learningLang}
          nativeLang={nativeLang}
          nativeLabel={p.finnish}
        />
      )}
    />
  );
}
