import React, { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Volume2 } from "lucide-react";
import { useSettings } from "../../app/SettingsContext";
import { useProgress } from "../../app/ProgressContext";
import i18n, { fill } from "../../i18n";
import { Feedback, GameScreen } from "../../components/lingo";
import { DEFAULT_LEARNING_LANG, DEFAULT_NATIVE_LANG, getSoundLessons } from "../../lib/words";
import { RATE_SLOW, canSpeak, speak } from "../../lib/speech";
import PracticeSession from "../practice/PracticeSession";
import SoundQuestion, { MarkedWord } from "./SoundQuestion";
import { BY_EAR, KINDS, buildSoundRound, lessonProgress, lessonWords } from "./soundsLogic";

const MIX = "mix";

// Title in the interface language, with the other language underneath.
function Titles({ title, lang, as: Tag = "p", className }) {
  const main = lang === "fi" ? title.fi || title.en : title.en;
  const other = lang === "fi" ? title.en : title.fi;
  return (
    <>
      <Tag className={className}>{main}</Tag>
      {other && other !== main && <p className="lg-caption" lang={lang === "fi" ? "en" : "fi"}>{other}</p>}
    </>
  );
}

function NoSpeechNote({ s, lang }) {
  if (canSpeak()) return null;
  return <Feedback variant="info" title={s.noSpeech} fi={lang === "en" ? i18n.fi.sounds.noSpeech : undefined} />;
}

// Every lesson, grouped into silent letters, tricky letters, sound-alike
// words and letter names.
function LessonList({ lessons }) {
  const { t, lang } = useSettings();
  const { state } = useProgress();
  const s = t.sounds;
  const fi = i18n.fi.sounds;
  return (
    <GameScreen title={s.name}>
      <main className="lg-board lg-page snd-home">
        <p className="lg-body-lg">{s.intro}</p>
        {lang === "en" && <p className="lg-caption" lang="fi">{fi.intro}</p>}
        <NoSpeechNote s={s} lang={lang} />
        <div className="lg-cta">
          <Link to={`/sounds?set=${MIX}`} className="lg-btn lg-btn--primary lg-btn--hero">{s.mix}</Link>
        </div>
        {KINDS.map((kind) => {
          const inKind = lessons.filter((l) => l.kind === kind);
          if (!inKind.length) return null;
          return (
            <section key={kind} className="lg-section">
              <Titles title={{ en: t.sounds.kinds[kind], fi: fi.kinds[kind] }} lang={lang} as="h2" className="lg-heading" />
              <ul className="snd-lessons">
                {inKind.map((lesson) => {
                  const { solved, total } = lessonProgress(lesson, state, DEFAULT_LEARNING_LANG);
                  const all = solved === total;
                  return (
                    <li key={lesson.id}>
                      <Link to={`/sounds?set=${lesson.id}`} className={`snd-lesson${all ? " snd-lesson--done" : ""}`}>
                        <span className="snd-lesson__title" lang="en">{lesson.title.en}</span>
                        {lesson.title.fi && <span className="snd-lesson__fi" lang="fi">{lesson.title.fi}</span>}
                        <span className="lg-caption snd-lesson__progress">
                          {all && <span className="snd-lesson__check" aria-hidden="true">✓ </span>}
                          {all ? s.lessonDone : fill(s.lessonProgress, { n: solved, total })}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </main>
    </GameScreen>
  );
}

// The rule and its words to listen to, then one button to practise them.
function Lesson({ lesson }) {
  const { t, lang } = useSettings();
  const s = t.sounds;
  const words = lessonWords(lesson);
  const speech = canSpeak();
  const ex = lesson.explanation;
  return (
    <GameScreen title={s.name}>
      <main className="lg-board lg-page snd-lesson-page">
        <div>
          <span className="lg-caption">{lang === "fi" ? i18n.fi.sounds.kinds[lesson.kind] : s.kinds[lesson.kind]}</span>
          <Titles title={lesson.title} lang={lang} as="h2" className="lg-title" />
        </div>
        <section className="gp-why snd-rule" aria-label={s.rule}>
          {lang === "fi" ? (
            <p className="gp-why__text" lang="fi">{ex.fi || ex.en}</p>
          ) : (
            <>
              <p className="gp-why__text">{ex.en}</p>
              {ex.fi && <p className="gp-why__fi" lang="fi">{ex.fi}</p>}
            </>
          )}
        </section>
        <NoSpeechNote s={s} lang={lang} />
        <section className="lg-section">
          {speech && <h3 className="lg-caption">{s.wordsTitle}</h3>}
          <ul className="snd-words">
            {words.map((word) => (
              <li key={word.text} className="snd-words__row">
                <button
                  type="button"
                  className="snd-words__word"
                  onClick={() => speak(word.speak, { lang: DEFAULT_LEARNING_LANG })}
                  disabled={!speech}
                  aria-label={word.text}
                >
                  {speech && <Volume2 size={22} strokeWidth={2} aria-hidden="true" />}
                  <span className="snd-words__text">
                    <MarkedWord word={word} silent={lesson.kind === "silent"} className="snd-words__en" />
                    <span className="snd-words__fi" lang="fi">
                      {word.say && <span className="snd-words__say">{word.say}</span>}
                      {word.say && word.fi && " · "}
                      {word.fi}
                    </span>
                  </span>
                </button>
                {speech && (
                  <button
                    type="button"
                    className="lg-btn lg-btn--quiet"
                    onClick={() => speak(word.speak, { lang: DEFAULT_LEARNING_LANG, rate: RATE_SLOW })}
                    aria-label={`${word.text}, ${s.slowly.toLowerCase()}`}
                  >
                    {s.slowly}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </main>
      {/* In the tray so the next step is on screen without scrolling the word list. */}
      <div className="lg-tray lg-tray--actions snd-actions">
        {(speech || !BY_EAR.includes(lesson.kind)) && (
          <Link to={`/sounds?set=${lesson.id}&practise=1`} className="lg-btn lg-btn--primary lg-btn--hero">
            {s.practise}
          </Link>
        )}
        <Link to="/sounds" className="lg-btn lg-btn--quiet">{s.allLessons}</Link>
      </div>
    </GameScreen>
  );
}

function Practice({ setId }) {
  const { t } = useSettings();
  const s = t.sounds;
  const lessons = getSoundLessons();
  const mix = setId === MIX;
  return (
    <PracticeSession
      gameId="sounds"
      title={s.name}
      intro={s.practiceIntro}
      learningLang={DEFAULT_LEARNING_LANG}
      nativeLang={DEFAULT_NATIVE_LANG}
      meaningInFeedback={false}
      buildQuestions={() => buildSoundRound(lessons, { setId: mix ? null : setId, withSound: canSpeak() })}
      renderQuestion={({ question, done, onDone }) => (
        <SoundQuestion question={question} done={done} onDone={onDone} showRule={mix} />
      )}
      endExtra={<Link to="/sounds" className="lg-btn lg-btn--secondary">{s.allLessons}</Link>}
    />
  );
}

// Sounds of English: lessons on silent letters, letters with more than one
// sound and letter names, from the word bank's "sound" items.
//   /sounds            the lesson list
//   /sounds?set=<id>   one lesson: its rule and words to listen to
//   /sounds?set=<id>&practise=1   practice on that lesson's words
//   /sounds?set=mix    practice across every lesson
export default function SoundsGame() {
  const [params] = useSearchParams();
  const setId = params.get("set");
  const lessons = useMemo(() => getSoundLessons(), []);
  const lesson = lessons.find((l) => l.id === setId);

  if (setId === MIX || (lesson && params.has("practise"))) return <Practice key={setId} setId={setId} />;
  if (lesson) return <Lesson lesson={lesson} />;
  return <LessonList lessons={lessons} />;
}
