import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { DEFAULT_LEARNING_LANG, DEFAULT_NATIVE_LANG, getTexts } from "../../lib/words";
import { applyPreferences } from "../../lib/preferences";
import PracticeSession from "../practice/PracticeSession";
import StoryQuestion from "./StoryQuestion";
import { STORY_ROUND, buildStoryRound, isStoryText } from "./storyLogic";
import { useRounds } from "../../lib/rounds";

// Translate the story: a piece of a classic story translated into Finnish
// phrase by phrase. `?set=<text id>` reads one story.
export default function StoryGame() {
  const [params] = useSearchParams();
  const rounds = useRounds(STORY_ROUND, { max: 3 });
  const { t } = useSettings();
  const setId = params.get("set");
  const build = useMemo(
    () => () => {
      const all = getTexts().filter(isStoryText);
      const one = setId ? all.filter((x) => x.id === setId) : [];
      return buildStoryRound(one.length ? one : applyPreferences(all, { min: 2 }), { count: rounds });
    },
    [setId, rounds]
  );

  return (
    <PracticeSession
      gameId="story"
      title={t.story.name}
      intro={t.story.intro}
      learningLang={DEFAULT_LEARNING_LANG}
      nativeLang={DEFAULT_NATIVE_LANG}
      endTitleKey="endTitleStory"
      recapTitleKey="recapStory"
      keys={{ pairsDoneTitle: "storyDoneTitle", pairsAllFirstTry: "storyAllFirstTry", pairsFirstTry: "storyFirstTry" }}
      empty={t.story.empty}
      buildQuestions={build}
      renderQuestion={({ question, onDone, onItem }) => <StoryQuestion question={question} onDone={onDone} onItem={onItem} />}
    />
  );
}
