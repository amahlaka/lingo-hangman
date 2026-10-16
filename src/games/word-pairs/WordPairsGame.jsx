import React, { useRef, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { languageLabel } from "../../lib/words";
import { useLooseWordType } from "../../components/lingo";
import { sounds } from "../../lib/sounds";
import PracticeSession from "../practice/PracticeSession";
import { MAX_MISSES, buildPairBoards, isPairCandidate, practicePool } from "../practice/practiceLogic";

// One board: English words on one side, meanings on the other. Tap one from
// each side to make a pair. A found pair stays where it is, with the meaning
// shown under the English word, so the board never jumps around.
export function PairsBoard({ board, done, onItem, onDone, p, learningLang, nativeLang, learningLabel, nativeLabel }) {
  const [selected, setSelected] = useState(null); // { side, id }
  const [matched, setMatched] = useState([]);
  const [misses, setMisses] = useState({});
  // The wrong partners tried for each word, to see how learners go wrong.
  const tried = useRef({});
  const [wobble, setWobble] = useState(null); // tile keys like "native-3"
  const [hint, setHint] = useState("");

  const choose = (side, id) => {
    if (done || matched.includes(id)) return;
    if (!selected || selected.side === side) {
      // First pick, or a change of mind on the same side; tapping it again lets go.
      sounds.tap();
      setSelected(selected && selected.side === side && selected.id === id ? null : { side, id });
      return;
    }
    if (selected.id === id) {
      const missCount = misses[id] || 0;
      const nextMatched = [...matched, id];
      setMatched(nextMatched);
      setSelected(null);
      setHint("");
      const { pair } = board.items[id];
      onItem({
        solved: true,
        wrong: tried.current[id] || [],
        firstTry: missCount === 0,
        tries: missCount + 1,
        triesLeft: Math.max(0, MAX_MISSES - missCount),
        answer: pair.learning,
        meaning: pair.native,
      });
      if (nextMatched.length === board.items.length) onDone({ board: true });
      return;
    }
    // Not a pair: the miss counts against the word picked first.
    const other = board.items[id]?.pair;
    if (other) {
      const text = selected.side === "learning" ? other.native : other.learning;
      tried.current = { ...tried.current, [selected.id]: [...(tried.current[selected.id] || []), text] };
    }
    sounds.miss();
    setMisses((m) => ({ ...m, [selected.id]: (m[selected.id] || 0) + 1 }));
    setWobble([`${selected.side}-${selected.id}`, `${side}-${id}`]);
    setSelected(null);
    setHint(p.pairsMiss);
  };

  const typeOf = useLooseWordType();
  const tile = (side, { id, pair }, i) => {
    const isMatched = matched.includes(id);
    const isSelected = selected?.side === side && selected.id === id;
    const learning = side === "learning";
    const text = learning ? pair.learning : pair.native;
    const shaking = wobble?.includes(`${side}-${id}`);
    const type = learning ? typeOf(pair.learning, learningLang) : { className: "", tag: null };
    const cls = [
      "wp-tile" + type.className,
      isSelected && "wp-tile--selected",
      isMatched && (learning ? "wp-tile--matched lg-pop" : "wp-tile--used"),
      shaking && "lg-wobble",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <button
        key={id}
        type="button"
        className={cls}
        lang={learning ? learningLang : nativeLang}
        aria-pressed={isMatched ? undefined : isSelected}
        aria-label={isMatched && learning ? `${pair.learning}, ${pair.native}` : undefined}
        disabled={done || isMatched}
        onClick={() => choose(side, id)}
        onAnimationEnd={shaking ? () => setWobble(null) : undefined}
        style={{ "--i": i }}
        data-testid={`${side}-tile`}
      >
        <span className="wp-tile__mark" aria-hidden="true">{isMatched ? "✓" : ""}</span>
        <span className="wp-tile__words">
          <span className="wp-tile__text">{text}</span>
          {type.tag}
          {isMatched && learning && (
            <span className="wp-tile__native lg-reveal" lang={nativeLang}>{pair.native}</span>
          )}
        </span>
      </button>
    );
  };

  return (
    <div className="lg-stack pg-question">
      <div className="wp-board">
        <div className="wp-col" role="group" aria-label={p.learningWords}>
          <span className="lg-caption wp-col__label">{learningLabel}</span>
          {board.learning.map((item, i) => tile("learning", item, i))}
        </div>
        <div className="wp-col" role="group" aria-label={p.nativeWords}>
          <span className="lg-caption wp-col__label">{nativeLabel}</span>
          {board.native.map((item, i) => tile("native", item, i))}
        </div>
      </div>
      {hint && !done && <p className="pg-hint" role="status">{hint}</p>}
    </div>
  );
}

// Match English words with their Finnish meanings, five pairs to a board.
export default function WordPairsGame() {
  const [params] = useSearchParams();
  const { t } = useSettings();
  const p = t.practice;
  const search = params.toString();
  const { pairs, learningLang, nativeLang } = useMemo(() => {
    const pool = practicePool(new URLSearchParams(search));
    return { ...pool, pairs: pool.pairs.filter(isPairCandidate) };
  }, [search]);
  const nativeLabel = nativeLang === "fi" ? p.finnish : languageLabel(nativeLang);
  const learningLabel = learningLang.startsWith("en") ? p.english : languageLabel(learningLang);

  return (
    <PracticeSession
      gameId="word-pairs"
      title={p.pairsName}
      intro={p.pairsIntro}
      learningLang={learningLang}
      nativeLang={nativeLang}
      buildQuestions={() => buildPairBoards(pairs)}
      renderQuestion={({ question, done, onDone, onItem }) => (
        <PairsBoard
          board={question}
          done={done}
          onDone={onDone}
          onItem={onItem}
          p={p}
          learningLang={learningLang}
          nativeLang={nativeLang}
          learningLabel={learningLabel}
          nativeLabel={nativeLabel}
        />
      )}
    />
  );
}
