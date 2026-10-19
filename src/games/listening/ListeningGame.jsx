import React, { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Volume2 } from "lucide-react";
import { useSettings } from "../../app/SettingsContext";
import i18n from "../../i18n";
import { Feedback, GameScreen } from "../../components/lingo";
import PracticeSession from "../practice/PracticeSession";
import ChoiceQuestion from "../practice/ChoiceQuestion";
import ListenMore from "../practice/ListenMore";
import { ROUND_LENGTH, buildChoiceQuestion, buildRound, practicePool, wordCount } from "../practice/practiceLogic";
import { RATE_SLOW, canSpeak, speak, stopSpeaking } from "../../lib/speech";
import { useRounds } from "../../lib/rounds";

// Short items only: long sentences are a different skill from catching a word.
const MAX_LISTEN_WORDS = 4;

export function ListenPrompt({ text, lang, p }) {
  useEffect(() => {
    speak(text, { lang });
    return stopSpeaking;
  }, [text, lang]);
  return (
    <div className="pg-prompt pg-prompt--listen">
      <button type="button" className="pg-listen" onClick={() => speak(text, { lang })}>
        <Volume2 size={28} strokeWidth={2} aria-hidden="true" />
        <span>{p.listen}</span>
      </button>
      <button type="button" className="lg-btn lg-btn--quiet" onClick={() => speak(text, { lang, rate: RATE_SLOW })}>
        {p.listenSlowly}
      </button>
      <ListenMore text={text} lang={lang} p={p} />
    </div>
  );
}

// Hear an English word or short phrase, pick the one you heard.
export default function ListeningGame() {
  const [params] = useSearchParams();
  const rounds = useRounds(ROUND_LENGTH);
  const { t, lang } = useSettings();
  const p = t.practice;
  const search = params.toString();
  const { pairs, learningLang, nativeLang } = useMemo(() => {
    const pool = practicePool(new URLSearchParams(search));
    return { ...pool, pairs: pool.pairs.filter((w) => wordCount(w.learning) <= MAX_LISTEN_WORDS) };
  }, [search]);

  if (!canSpeak()) {
    return (
      <GameScreen title={p.listenName}>
        <main className="lg-board">
          <Feedback variant="info" title={p.noSpeech} fi={lang === "en" ? i18n.fi.practice.noSpeech : undefined} />
          <Link to="/" className="lg-btn lg-btn--primary">{t.allGames}</Link>
        </main>
      </GameScreen>
    );
  }

  return (
    <PracticeSession
      gameId="listening"
      title={p.listenName}
      intro={p.listenIntro}
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
          label={p.listenIntro}
          prompt={<ListenPrompt text={question.target.learning} lang={learningLang} p={p} />}
        />
      )}
    />
  );
}
