import React from "react";

// Say it right's pronunciation numbers (src/lib/pronunciationStats.js), on
// the admin Statistics page (over all learners) and a learner's page.

const pct = (share) => `${Math.round(share * 100)}%`;
const MODE_NAMES = { words: "Words", read: "Read aloud" };
const shortDay = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function Table({ head, rows }) {
  return (
    <div className="st-scroll">
      <table className="st-table">
        <thead>
          <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// `data`: { answers, modes, sounds, hardest, recent? }. `everyone`: the admin
// Statistics page, where rows only show what several learners had.
export default function PronunciationStats({ data, everyone = false, minLearners = 3, heading = "h2" }) {
  const H = heading;
  const Sub = heading === "h2" ? "h3" : "h4";
  const d = data || { answers: 0, modes: [], sounds: [], hardest: [] };
  return (
    <section className="lg-section">
      <H className="lg-heading">Pronunciation (Say it right)</H>
      {!d.answers ? (
        <p className="lg-caption">No scored words or readings yet.</p>
      ) : (
        <>
          <Table
            head={everyone ? ["Mode", "Scored", "Learners", "Average score", "Median pace"] : ["Mode", "Scored", "Average score", "Median pace"]}
            rows={d.modes.map((m) => [
              MODE_NAMES[m.mode] || m.mode,
              m.answers,
              ...(everyone ? [m.learners] : []),
              m.average,
              m.wpm ? `${m.wpm} words/min` : "–",
            ])}
          />
          <Sub className="lg-heading">Sounds missed most</Sub>
          <p className="lg-caption">
            Missed share counts a nearly said sound as half.{everyone ? ` Sounds at least ${minLearners} learners had.` : ""}
          </p>
          {d.sounds.length === 0 ? (
            <p className="lg-caption">None yet.</p>
          ) : (
            <Table
              head={everyone ? ["Sound", "Missed share", "Missed", "Nearly", "Times", "Learners"] : ["Sound", "Missed share", "Missed", "Nearly", "Times"]}
              rows={d.sounds.map((s) => [`/${s.symbol}/`, pct(s.rate), s.missed, s.close, s.seen, ...(everyone ? [s.learners] : [])])}
            />
          )}
          <Sub className="lg-heading">Hardest to say</Sub>
          <p className="lg-caption">Lowest average score.{everyone ? ` Words and readings at least ${minLearners} learners said.` : ""}</p>
          {d.hardest.length === 0 ? (
            <p className="lg-caption">None yet.</p>
          ) : (
            <Table
              head={everyone ? ["Word or reading", "Mode", "Average", "Scored", "Learners"] : ["Word or reading", "Mode", "Average", "Scored"]}
              rows={d.hardest.map((w) => [<span lang="en">{w.word}</span>, MODE_NAMES[w.mode] || w.mode, w.average, w.answers, ...(everyone ? [w.learners] : [])])}
            />
          )}
          {d.recent?.length > 0 && (
            <>
              <Sub className="lg-heading">Latest scores</Sub>
              <Table
                head={["Day", "Mode", "Word or reading", "Score", "Pace"]}
                rows={d.recent.map((r) => [shortDay(r.day), MODE_NAMES[r.mode] || r.mode, <span lang="en">{r.word}</span>, r.score, r.wpm ? `${r.wpm}/min` : "–"])}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
