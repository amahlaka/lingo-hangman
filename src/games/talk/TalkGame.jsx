import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { DEFAULT_LEARNING_LANG, DEFAULT_NATIVE_LANG, getTexts } from "../../lib/words";
import { applyPreferences } from "../../lib/preferences";
import PracticeSession from "../practice/PracticeSession";
import TalkQuestion from "./TalkQuestion";
import { TALK_ROUND, buildTalkRound, isTalkText } from "./talkLogic";
import { useRounds } from "../../lib/rounds";

// Your turn: everyday conversations (the word bank's dialogue texts) where the
// learner plays one speaker. `?set=<text id>` plays one conversation.
export default function TalkGame() {
  const [params] = useSearchParams();
  const rounds = useRounds(TALK_ROUND, { max: 3 });
  const { t } = useSettings();
  const setId = params.get("set");
  const build = useMemo(
    () => () => {
      const all = getTexts({ kind: "dialogue" }).filter(isTalkText);
      const one = setId ? all.filter((d) => d.id === setId) : [];
      const pool = one.length ? one : applyPreferences(all, { min: 3 });
      return buildTalkRound(pool, { count: rounds, allTexts: all });
    },
    [setId, rounds]
  );

  return (
    <PracticeSession
      gameId="talk"
      title={t.talk.name}
      intro={t.talk.intro}
      learningLang={DEFAULT_LEARNING_LANG}
      nativeLang={DEFAULT_NATIVE_LANG}
      endTitleKey="endTitleTalk"
      recapTitleKey="recapTalk"
      keys={{ pairsDoneTitle: "talkDoneTitle", pairsAllFirstTry: "talkAllFirstTry", pairsFirstTry: "talkFirstTry" }}
      empty={t.talk.empty}
      buildQuestions={build}
      renderQuestion={({ question, onDone, onItem }) => <TalkQuestion question={question} onDone={onDone} onItem={onItem} />}
    />
  );
}
