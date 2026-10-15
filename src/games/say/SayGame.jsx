import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import PracticeSession from "../practice/PracticeSession";
import { buildRound, practicePool, wordCount } from "../practice/practiceLogic";
import { MAX_SAY_WORDS, SAY_ROUND_LENGTH } from "./sayLogic";
import SayQuestion from "./SayQuestion";
import useSayMic from "./useSayMic";

export const SAY_KEYS = {
  correctTitle: "sayCorrectTitle",
  correctFirstTry: "sayCorrectFirstTry",
  correctLater: "sayCorrectLater",
  retryTitle: "sayRetryTitle",
};

// See an English word, hear it, then say it into the microphone.
export default function SayGame() {
  const [params] = useSearchParams();
  const { t } = useSettings();
  const p = t.practice;
  const search = params.toString();
  const { pairs, learningLang, nativeLang } = useMemo(() => {
    const pool = practicePool(new URLSearchParams(search));
    return { ...pool, pairs: pool.pairs.filter((w) => wordCount(w.learning) <= MAX_SAY_WORDS) };
  }, [search]);

  const { selfReason, setSelfReason, privacy, prepareOnDevice, onDeviceFailed, selfNote } = useSayMic(learningLang, p);

  return (
    <PracticeSession
      gameId="say"
      title={p.sayName}
      intro={selfReason ? p.sayIntroSelf : p.sayIntro}
      learningLang={learningLang}
      nativeLang={nativeLang}
      meaningInFeedback={false}
      keys={SAY_KEYS}
      buildQuestions={() => buildRound(pairs, SAY_ROUND_LENGTH)}
      renderQuestion={({ question, done, onDone }) => (
        <SayQuestion
          word={question}
          learningLang={learningLang}
          nativeLang={nativeLang}
          done={done}
          onDone={onDone}
          p={p}
          mode={selfReason ? "self" : "mic"}
          selfNote={selfNote}
          privacy={privacy}
          prepareOnDevice={prepareOnDevice}
          onBlocked={setSelfReason}
          onOnDeviceFailed={onDeviceFailed}
        />
      )}
    />
  );
}
