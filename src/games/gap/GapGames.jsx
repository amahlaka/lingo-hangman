import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { DEFAULT_LEARNING_LANG, DEFAULT_NATIVE_LANG, getGapItems, getTopics } from "../../lib/words";
import PracticeSession from "../practice/PracticeSession";
import GapQuestion from "./GapQuestion";
import { buildGapRound } from "./gapLogic";

// A round of gap sentences on the word bank's topics of one type ("rule" or
// "confusable"). `?set=<topic id>` practises a single topic, e.g.
// /mixed-up?set=borrow-lend.
function GapGame({ gameId, topicType, title, intro }) {
  const [params] = useSearchParams();
  const setId = params.get("set");
  const build = useMemo(
    () => () =>
      buildGapRound({ topics: getTopics(topicType), gaps: getGapItems({ lang: DEFAULT_LEARNING_LANG }) }, { setId }),
    [topicType, setId]
  );

  return (
    <PracticeSession
      gameId={gameId}
      title={title}
      intro={intro}
      learningLang={DEFAULT_LEARNING_LANG}
      nativeLang={DEFAULT_NATIVE_LANG}
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
  return <GapGame gameId="grammar" topicType="rule" title={t.practice.grammarName} intro={t.practice.grammarIntro} />;
}

// Word pairs that are one word in Finnish (borrow/lend, make/do) and false friends.
export function MixedUpGame() {
  const { t } = useSettings();
  return <GapGame gameId="mixed-up" topicType="confusable" title={t.practice.mixedName} intro={t.practice.mixedIntro} />;
}
