import React, { useState } from "react";
import { useSettings } from "../../app/SettingsContext";
import { fill } from "../../i18n";
import { loadTopicChoice, saveTopicChoice } from "./topicChoice";

// "Topics: All" under the instruction; tapping it opens chips for choosing
// one or more topics. "Play these" starts a new round with them. `topics` are
// [{ id, title: { en, fi } }]; `chosen` is the picked ids, empty for all.
export default function TopicPicker({ topics, chosen, onChoose }) {
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

// The learner's remembered topics for `gameId`, limited to `topics` (ids no
// longer in the word bank are dropped; none left means all). `round` changes
// on every choice: use it as the session's key so "Play these" always starts
// a new round. With `enabled` false nothing is loaded and every topic plays.
export function useTopicChoice(gameId, topics, enabled = true) {
  const [stored, setStored] = useState(() => (enabled ? loadTopicChoice(gameId) : []));
  const chosen = stored.filter((id) => topics.some((topic) => topic.id === id));
  const [round, setRound] = useState(0);
  const choose = (ids) => {
    saveTopicChoice(gameId, ids);
    setStored(ids);
    setRound((r) => r + 1);
  };
  return { chosen, choose, round };
}
