import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { fill } from "../../i18n";
import { DEFAULT_LEARNING_LANG, DEFAULT_NATIVE_LANG, getGapItems, getTopics } from "../../lib/words";
import PracticeSession from "../practice/PracticeSession";
import GapQuestion from "./GapQuestion";
import { buildGapRound, gapTopics } from "./gapLogic";
import { loadTopicChoice, saveTopicChoice } from "./topicChoice";

// "Topics: All" under the instruction; tapping it opens chips for choosing
// one or more topics. "Play these" starts a new round with them.
function TopicPicker({ topics, chosen, onChoose }) {
  const { t, lang } = useSettings();
  const p = t.practice;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(chosen);
  const name = (topic) => topic.title[lang] || topic.title.en;
  const summary = chosen.length
    ? chosen.length === 1
      ? name(topics.find((topic) => topic.id === chosen[0]))
      : fill(p.topicsSome, { n: chosen.length })
    : p.topicsAll;

  const toggle = (id) => setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  const show = () => {
    setDraft(chosen);
    setOpen((o) => !o);
  };
  const play = () => {
    setOpen(false);
    onChoose(draft.length === topics.length ? [] : draft);
  };

  return (
    <div className="pg-topics">
      <button type="button" className="lg-btn lg-btn--quiet pg-topics__toggle" aria-expanded={open} onClick={show}>
        {p.topicsLabel}: <strong>{summary}</strong>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="pg-topics__panel" role="group" aria-label={p.topicsLabel}>
          <p className="lg-caption">{p.topicsHelp}</p>
          <div className="lg-chips">
            <button
              type="button"
              className={`lg-chip${draft.length === 0 ? " lg-chip--on" : ""}`}
              aria-pressed={draft.length === 0}
              onClick={() => setDraft([])}
            >
              {p.topicsAll}
            </button>
            {topics.map((topic) => {
              const on = draft.includes(topic.id);
              return (
                <button
                  key={topic.id}
                  type="button"
                  className={`lg-chip${on ? " lg-chip--on" : ""}`}
                  aria-pressed={on}
                  onClick={() => toggle(topic.id)}
                >
                  <span className="lg-chip__mark" aria-hidden="true">{on ? "✓" : "+"}</span>
                  {name(topic)}
                </button>
              );
            })}
          </div>
          <button type="button" className="lg-btn lg-btn--primary" onClick={play}>
            {p.topicsPlay}
          </button>
        </div>
      )}
    </div>
  );
}

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
  const [stored, setStored] = useState(() => (pickTopics ? loadTopicChoice(gameId) : []));
  // Topics no longer in the word bank are dropped; none left means all.
  const chosen = stored.filter((id) => topics.some((topic) => topic.id === id));
  // Bumped on every choice so "Play these" always starts a new round.
  const [round, setRound] = useState(0);
  const choose = (ids) => {
    saveTopicChoice(gameId, ids);
    setStored(ids);
    setRound((r) => r + 1);
  };
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
