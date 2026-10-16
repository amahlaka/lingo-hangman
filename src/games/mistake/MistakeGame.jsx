import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { DEFAULT_LEARNING_LANG, DEFAULT_NATIVE_LANG, getGapItems, getTopics } from "../../lib/words";
import PracticeSession from "../practice/PracticeSession";
import MistakeQuestion from "./MistakeQuestion";
import { buildMistakeRound } from "./mistakeLogic";

// Spot the mistake: grammar and mixed-up words sentences with one typical
// mistake in them. `?set=<topic id>` practises one topic.
export default function MistakeGame() {
  const [params] = useSearchParams();
  const { t } = useSettings();
  const setId = params.get("set");
  const build = useMemo(
    () => () => {
      const all = [...getTopics("rule"), ...getTopics("confusable")];
      const one = setId ? all.filter((topic) => topic.id === setId) : [];
      const topics = one.length ? one : all;
      return buildMistakeRound({ topics, gaps: getGapItems({ lang: DEFAULT_LEARNING_LANG, preferences: true }) });
    },
    [setId]
  );

  return (
    <PracticeSession
      gameId="spot-mistake"
      title={t.mistake.name}
      intro={t.mistake.intro}
      learningLang={DEFAULT_LEARNING_LANG}
      nativeLang={DEFAULT_NATIVE_LANG}
      endTitleKey="endTitleSentences"
      recapTitleKey="recapSentences"
      meaningInFeedback={false}
      keys={{ correctTitle: "mistakeCorrectTitle", retryTitle: "mistakeRetryTitle" }}
      buildQuestions={build}
      renderQuestion={({ question, done, onDone }) => <MistakeQuestion question={question} done={done} onDone={onDone} />}
    />
  );
}
