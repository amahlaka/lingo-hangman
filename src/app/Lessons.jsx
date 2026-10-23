import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { useSettings } from "./SettingsContext";
import { fill } from "../i18n";
import { GameScreen } from "../components/lingo";
import { GAMES } from "../games/registry";
import { getItem, getLessonChapters } from "../lib/words";
import { markLessonRead, nextLesson, readLessons } from "../lib/lessonsRead";
import LessonBlocks from "./LessonBlocks";

// Textbook lessons: short reads on how English works, letters and their
// sounds, and spelling memory rules, from the word base's "lesson" items.
//   /lessons        every lesson by chapter
//   /lessons/:id    one lesson, with links to games that practise it

const inLang = (map, lang) => (map ? map[lang] || map.en : "");
const otherLang = (lang) => (lang === "fi" ? "en" : "fi");

function useChapters() {
  return useMemo(() => getLessonChapters(), []);
}

// Where a lesson's practice link goes and what it says: the game, and the
// lesson, rule or text of that game when it names one.
export function practiceLinks(lesson, lang) {
  return (lesson.practice || [])
    .map(({ game: id, set }) => {
      const game = GAMES.find((g) => g.id === id);
      if (!game || game.restricted) return null;
      const gameName = lang === "fi" ? game.nameFi : game.name;
      const setItem = set ? getItem(set) : null;
      if (set && !setItem) return null;
      return {
        key: `${id}:${set || ""}`,
        to: set ? `${game.path}?set=${encodeURIComponent(set)}` : game.path,
        game: gameName,
        topic: setItem?.title ? inLang(setItem.title, lang) : null,
      };
    })
    .filter(Boolean);
}

// Home's card: what the lessons are and the next one to read.
export function LessonsCard() {
  const { t, lang } = useSettings();
  const l = t.lessons;
  const chapters = useChapters();
  const lessons = chapters.flatMap((c) => c.lessons);
  if (!lessons.length) return null;
  const read = readLessons();
  const next = nextLesson(lessons, read);
  const done = lessons.filter((x) => read.has(x.id)).length;
  return (
    <Link to={next && done > 0 ? `/lessons/${next.id}` : "/lessons"} className="lg-card qp-card ls-card">
      <span className="qp-card__icon ls-card__icon" aria-hidden="true"><BookOpen size={26} strokeWidth={2} /></span>
      <span className="qp-card__text">
        <span className="lg-card__name">{l.title}</span>
        <span className="lg-card__fi" lang={otherLang(lang)}>{l.titleOther}</span>
        <span className="lg-card__desc">{l.cardDesc}</span>
        <span className="lg-caption">
          {next ? (done ? fill(l.cardNext, { title: inLang(next.title, lang) }) : fill(l.cardCount, { total: lessons.length })) : l.allRead}
        </span>
      </span>
    </Link>
  );
}

function LessonList() {
  const { t, lang } = useSettings();
  const l = t.lessons;
  const chapters = useChapters();
  const lessons = chapters.flatMap((c) => c.lessons);
  const read = readLessons();
  const next = nextLesson(lessons, read);
  let n = 0;
  return (
    <GameScreen title={l.title} bottomNav>
      <main className="lg-board lg-page ls-home">
        <p className="lg-body-lg">{l.intro}</p>
        {next && (
          <div className="lg-cta">
            <Link to={`/lessons/${next.id}`} className="lg-btn lg-btn--primary lg-btn--hero">
              {read.size ? l.continue : l.start}
            </Link>
          </div>
        )}
        {!next && lessons.length > 0 && <p className="lg-caption">{l.allRead}</p>}
        {chapters.map((chapter) => (
          <section key={chapter.id} className="lg-section">
            <h2 className="lg-heading">{inLang(chapter.title, lang)}</h2>
            {chapter.summary && <p className="lg-caption">{inLang(chapter.summary, lang)}</p>}
            <ol className="snd-lessons ls-lessons">
              {chapter.lessons.map((lesson) => {
                n += 1;
                const done = read.has(lesson.id);
                return (
                  <li key={lesson.id}>
                    <Link to={`/lessons/${lesson.id}`} className={`snd-lesson${done ? " snd-lesson--done" : ""}`}>
                      <span className="lg-caption">
                        {done && <span className="snd-lesson__check" aria-label={l.readMark}>✓ </span>}
                        {fill(l.lessonN, { n })}
                      </span>
                      <span className="snd-lesson__title" lang={lang}>{inLang(lesson.title, lang)}</span>
                      {lesson.summary && <span className="snd-lesson__fi" lang={lang}>{inLang(lesson.summary, lang)}</span>}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </main>
    </GameScreen>
  );
}

function Lesson({ lesson, chapter, next }) {
  const { t, lang } = useSettings();
  const l = t.lessons;
  // The lesson can be read in the other language without changing the app's.
  const [textLang, setTextLang] = useState(lang);
  useEffect(() => setTextLang(lang), [lang, lesson.id]);
  useEffect(() => {
    markLessonRead(lesson.id);
    // "Next" opens the following lesson at its top.
    if (typeof document !== "undefined") document.documentElement.scrollTop = 0;
  }, [lesson.id]);
  const links = practiceLinks(lesson, lang);
  const other = otherLang(textLang);

  return (
    <GameScreen title={l.title}>
      <main className="lg-board lg-page ls-lesson">
        <div className="ls-lesson__head">
          {chapter && <span className="lg-caption">{inLang(chapter.title, textLang)}</span>}
          <h2 className="lg-title" lang={textLang}>{inLang(lesson.title, textLang)}</h2>
          {lesson.title[other] && <p className="lg-caption" lang={other}>{lesson.title[other]}</p>}
          <button type="button" className="lg-btn lg-btn--quiet ls-lang" lang={other} onClick={() => setTextLang(other)}>
            {l.readIn[other]}
          </button>
        </div>
        <LessonBlocks blocks={lesson.blocks} lang={textLang} l={l} />
        {links.length > 0 && (
          <section className="lg-section ls-practice" aria-labelledby="ls-practice">
            <h3 className="lg-heading" id="ls-practice">{l.practiceTitle}</h3>
            <p className="lg-caption">{l.practiceIntro}</p>
            <div className="ls-practice__links">
              {links.map((link) => (
                <Link key={link.key} to={link.to} className="lg-btn lg-btn--secondary ls-practice__link">
                  <span>{link.game}</span>
                  {link.topic && <span className="ls-practice__topic">{link.topic}</span>}
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <div className="lg-tray lg-tray--actions">
        {next ? (
          <Link to={`/lessons/${next.id}`} className="lg-btn lg-btn--primary lg-btn--hero">
            {fill(l.next, { title: inLang(next.title, lang) })}
          </Link>
        ) : (
          <Link to="/lessons" className="lg-btn lg-btn--primary lg-btn--hero">{l.finished}</Link>
        )}
        {next && <Link to="/lessons" className="lg-btn lg-btn--quiet">{l.all}</Link>}
      </div>
    </GameScreen>
  );
}

export default function Lessons() {
  const { id } = useParams();
  const chapters = useChapters();
  if (!id) return <LessonList />;
  const lessons = chapters.flatMap((c) => c.lessons);
  const at = lessons.findIndex((x) => x.id === id);
  if (at < 0) return <LessonList />;
  const lesson = lessons[at];
  return <Lesson key={lesson.id} lesson={lesson} chapter={chapters.find((c) => c.lessons.includes(lesson))} next={lessons[at + 1] || null} />;
}
