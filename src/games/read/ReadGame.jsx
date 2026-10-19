import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { DEFAULT_LEARNING_LANG, DEFAULT_NATIVE_LANG, getTexts } from "../../lib/words";
import { applyPreferences } from "../../lib/preferences";
import PracticeSession from "../practice/PracticeSession";
import ReadQuestion from "./ReadQuestion";
import { READ_ROUND, buildReadRound, isReadText } from "./readLogic";
import { useRounds } from "../../lib/rounds";

// Read and understand: short real-life texts with easy questions.
// `?set=<text id>` reads one text.
export default function ReadGame() {
  const [params] = useSearchParams();
  const rounds = useRounds(READ_ROUND, { max: 3 });
  const { t } = useSettings();
  const setId = params.get("set");
  const build = useMemo(
    () => () => {
      const all = getTexts().filter(isReadText);
      const one = setId ? all.filter((x) => x.id === setId) : [];
      return buildReadRound(one.length ? one : applyPreferences(all, { min: 4 }), { count: rounds });
    },
    [setId, rounds]
  );

  return (
    <PracticeSession
      gameId="read"
      title={t.read.name}
      intro={t.read.intro}
      learningLang={DEFAULT_LEARNING_LANG}
      nativeLang={DEFAULT_NATIVE_LANG}
      endTitleKey="endTitleRead"
      recapTitleKey="recapRead"
      keys={{ pairsDoneTitle: "readDoneTitle", pairsAllFirstTry: "readAllFirstTry", pairsFirstTry: "readFirstTry" }}
      empty={t.read.empty}
      buildQuestions={build}
      renderQuestion={({ question, onDone, onItem }) => <ReadQuestion question={question} onDone={onDone} onItem={onItem} />}
    />
  );
}
