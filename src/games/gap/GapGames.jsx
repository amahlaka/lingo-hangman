import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { DEFAULT_LEARNING_LANG, DEFAULT_NATIVE_LANG, getGapItems, getTopics } from "../../lib/words";
import PracticeSession from "../practice/PracticeSession";
import GapQuestion from "./GapQuestion";
import { buildGapRound, gapTopics } from "./gapLogic";
import TopicPicker, { useTopicChoice } from "../practice/TopicPicker";

// A round of gap sentences on the word bank's topics of one type ("rule" or
// "confusable"). `?set=<topic id>` practises a single topic, e.g.
// /mixed-up?set=borrow-lend. With `pickTopics` the learner can choose which
// topics to play; the choice is remembered on this device.
function GapGame({ gameId, topicType, title, intro, pickTopics = false }) {
  const [params] = useSearchParams();
  const setId = params.get("set");
  const content = useMemo(
    () => ({ topics: getTopics(topicType), gaps: getGapItems({ lang: DEFAULT_LEARNING_LANG }) }),
    [topicType]
  );
  const topics = useMemo(() => gapTopics(content), [content]);
  const { chosen, choose, round } = useTopicChoice(gameId, topics, pickTopics);
  const build = useMemo(
    () => () => buildGapRound(content, { setId, setIds: chosen }),
    [content, setId, chosen.join(",")]
  );
  const picker =
    pickTopics && !setId && topics.length > 1 ? <TopicPicker topics={topics} chosen={chosen} onChoose={choose} /> : null;

  return (
    <PracticeSession
      key={round}
      gameId={gameId}
      title={title}
      intro={intro}
      introExtra={picker}
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
  return (
    <GapGame gameId="grammar" topicType="rule" title={t.practice.grammarName} intro={t.practice.grammarIntro} pickTopics />
  );
}

// Word pairs that are one word in Finnish (borrow/lend, make/do) and false friends.
export function MixedUpGame() {
  const { t } = useSettings();
  return <GapGame gameId="mixed-up" topicType="confusable" title={t.practice.mixedName} intro={t.practice.mixedIntro} />;
}
