import React, { useMemo, useRef } from "react";
import { useSettings } from "../../app/SettingsContext";
import { useProgress } from "../../app/ProgressContext";
import {
  DEFAULT_LEARNING_LANG,
  DEFAULT_NATIVE_LANG,
  filterCommonWords,
  getGapItems,
  getSentences,
  getSoundLessons,
  getTopics,
  getWordGroups,
} from "../../lib/words";
import { canSpeak } from "../../lib/speech";
import PracticeSession from "../practice/PracticeSession";
import ChoiceQuestion from "../practice/ChoiceQuestion";
import { ListenPrompt } from "../listening/ListeningGame";
import { PhraseQuestion } from "../phrase/PhraseGame";
import { GapQuestion as FillGapQuestion } from "../fill-gap/FillGapGame";
import GapQuestion from "../gap/GapQuestion";
import SoundQuestion from "../sounds/SoundQuestion";
import { buildQuickRound, preferenceFilter, quickTargets } from "./quickLogic";

const learningLang = DEFAULT_LEARNING_LANG;
const nativeLang = DEFAULT_NATIVE_LANG;

// Name and one-line instruction of each game Quick play can ask from.
function gameText(game, t) {
  const p = t.practice;
  return {
    meaning: [p.meaningName, p.meaningIntro],
    listening: [p.listenName, p.listenIntro],
    phrase: [p.phraseName, p.phraseIntro],
    "fill-the-gap": [p.gapName, p.gapIntro],
    grammar: [p.grammarName, p.grammarIntro],
    "mixed-up": [p.mixedName, p.mixedIntro],
    sounds: [t.sounds.name, t.sounds.practiceIntro],
  }[game];
}

// Which game this question comes from and what to do. Whether it is an easy
// win or a challenge stays behind the scenes.
function QuestionHeader({ question, t }) {
  const [name, intro] = gameText(question.quick.game, t);
  return (
    <div className="qp-head">
      <div className="qp-head__row">
        <span className="lg-caption qp-head__game">{name}</span>
      </div>
      <p className="qp-head__intro">{intro}</p>
    </div>
  );
}

function QuickQuestion({ question, done, onDone, t, lang }) {
  const p = t.practice;
  const game = question.quick.game;
  let body;
  if (game === "meaning" || game === "listening") {
    body = (
      <ChoiceQuestion
        question={question}
        learningLang={learningLang}
        nativeLang={nativeLang}
        done={done}
        onDone={onDone}
        tryAnother={p.tryAnother}
        label={gameText(game, t)[1]}
        prompt={
          game === "listening" ? (
            <ListenPrompt text={question.target.learning} lang={learningLang} p={p} />
          ) : (
            <div className="pg-prompt">
              <span className="lg-caption">{p.finnish}</span>
              <p className="pg-prompt__word" lang={nativeLang} data-testid="prompt-word">{question.target.native}</p>
            </div>
          )
        }
      />
    );
  } else if (game === "phrase") {
    body = (
      <PhraseQuestion
        puzzle={question}
        done={done}
        onDone={onDone}
        p={p}
        learningLang={learningLang}
        nativeLang={nativeLang}
        nativeLabel={p.finnish}
      />
    );
  } else if (game === "fill-the-gap") {
    body = (
      <FillGapQuestion
        question={question}
        done={done}
        onDone={onDone}
        p={p}
        learningLang={learningLang}
        nativeLang={nativeLang}
        nativeLabel={p.finnish}
        uiLang={lang}
      />
    );
  } else if (game === "grammar" || game === "mixed-up") {
    body = <GapQuestion question={question} done={done} onDone={onDone} />;
  } else {
    body = <SoundQuestion question={question} done={done} onDone={onDone} showRule />;
  }
  return (
    <div className="lg-stack qp-question">
      <QuestionHeader question={question} t={t} />
      {body}
    </div>
  );
}

// Quick play (/quick): one round mixing questions from the other games, picked
// from the learner's own answer statistics. See quickLogic.js.
export default function QuickPlay() {
  const { t, lang } = useSettings();
  const { state } = useProgress();
  const targets = useMemo(
    () =>
      quickTargets({
        // Words, sentences and gap sentences follow the learner's focus areas and
        // difficulty here; preferenceFilter() then narrows the whole mix.
        pairs: filterCommonWords({ learningLang, nativeLang, preferences: true }),
        sentences: getSentences({ learningLang, nativeLang, preferences: true }),
        gapItems: getGapItems({ lang: learningLang, preferences: true }),
        topics: { rule: getTopics("rule"), confusable: getTopics("confusable") },
        lessons: getSoundLessons(),
        groups: getWordGroups(),
        learningLang,
        nativeLang,
        withSound: canSpeak(),
      }),
    []
  );
  // Read progress when a round is built, not on every answer.
  const stateRef = useRef(state);
  stateRef.current = state;

  return (
    <PracticeSession
      gameId="quick-play"
      title={t.quick.name}
      intro={t.quick.intro}
      learningLang={learningLang}
      nativeLang={nativeLang}
      endTitleKey="endTitleQuick"
      recapTitleKey="recapQuick"
      buildQuestions={() => buildQuickRound(targets, stateRef.current, { include: preferenceFilter(targets) })}
      renderQuestion={({ question, done, onDone }) => (
        <QuickQuestion question={question} done={done} onDone={onDone} t={t} lang={lang} />
      )}
    />
  );
}
