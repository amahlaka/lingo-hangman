import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { languageLabel } from "../../lib/words";
import PracticeSession from "../practice/PracticeSession";
import ChoiceQuestion from "../practice/ChoiceQuestion";
import { ROUND_LENGTH, buildChoiceQuestion, buildRound, practicePool } from "../practice/practiceLogic";
import { useRounds } from "../../lib/rounds";

// See a Finnish word, pick its English meaning from four options.
export default function MeaningGame() {
  const [params] = useSearchParams();
  const rounds = useRounds(ROUND_LENGTH);
  const { t } = useSettings();
  const p = t.practice;
  const search = params.toString();
  const { pairs, learningLang, nativeLang } = useMemo(() => practicePool(new URLSearchParams(search)), [search]);
  const nativeLabel = nativeLang === "fi" ? p.finnish : languageLabel(nativeLang);

  return (
    <PracticeSession
      gameId="meaning"
      title={p.meaningName}
      intro={p.meaningIntro}
      learningLang={learningLang}
      nativeLang={nativeLang}
      buildQuestions={() => (pairs.length >= 4 ? buildRound(pairs, rounds).map((w) => buildChoiceQuestion(w, pairs)) : [])}
      renderQuestion={({ question, done, onDone }) => (
        <ChoiceQuestion
          question={question}
          learningLang={learningLang}
          nativeLang={nativeLang}
          done={done}
          onDone={onDone}
          tryAnother={p.tryAnother}
          label={p.meaningIntro}
          prompt={
            <div className="pg-prompt">
              <span className="lg-caption">{nativeLabel}</span>
              <p className="pg-prompt__word" lang={nativeLang} data-testid="prompt-word">{question.target.native}</p>
            </div>
          }
        />
      )}
    />
  );
}
