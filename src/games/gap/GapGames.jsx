import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import grammar from "../../content/grammar.json";
import confusables from "../../content/confusables.json";
import PracticeSession from "../practice/PracticeSession";
import GapQuestion from "./GapQuestion";
import { buildGapRound } from "./gapLogic";

// A round of gap sentences from one content file. `?set=<id>` practises a
// single set, e.g. /mixed-up?set=borrow-lend.
function GapGame({ gameId, content, title, intro }) {
  const [params] = useSearchParams();
  const setId = params.get("set");
  const build = useMemo(() => () => buildGapRound(content, { setId }), [content, setId]);

  return (
    <PracticeSession
      gameId={gameId}
      title={title}
      intro={intro}
      learningLang={content.learningLang}
      nativeLang={content.nativeLang}
      endTitleKey="endTitleSentences"
      recapTitleKey="recapSentences"
      meaningInFeedback={false}
      buildQuestions={build}
      renderQuestion={({ question, done, onDone }) => <GapQuestion question={question} done={done} onDone={onDone} />}
    />
  );
}

// Articles, prepositions, he/she and other grammar Finnish speakers trip on.
export function GrammarGame() {
  const { t } = useSettings();
  return <GapGame gameId="grammar" content={grammar} title={t.practice.grammarName} intro={t.practice.grammarIntro} />;
}

// Word pairs that are one word in Finnish (borrow/lend, make/do) and false friends.
export function MixedUpGame() {
  const { t } = useSettings();
  return <GapGame gameId="mixed-up" content={confusables} title={t.practice.mixedName} intro={t.practice.mixedIntro} />;
}
