import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import i18n from "../../i18n";

// Words in rule texts that get a tooltip with the letters they mean:
// "vowel", "consonants", and Finnish "vokaali", "konsonanttiäänteen" and so on.
const TERM_PATTERN = /(?<!\p{L})(?:(?:vowels?|consonants?)(?!\p{L})|(?:vokaal|konsonant)\p{L}*)/giu;

// Splits text into plain parts and { term, kind, lang } parts.
export function splitTerms(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(TERM_PATTERN)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    const word = m[0].toLowerCase();
    const fi = word.startsWith("vokaal") || word.startsWith("konsonant");
    parts.push({ text: m[0], kind: word.startsWith("vo") ? "vowel" : "consonant", lang: fi ? "fi" : "en" });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

const GAP = 6;
const EDGE = 8;

// An underlined word that shows its tooltip on hover (mouse) or tap, and
// keeps it until tapped again, Escape, a tap elsewhere or scrolling.
export default function Term({ kind, lang, children }) {
  const tip = (i18n[lang] || i18n.en).terms[kind];
  const id = useId();
  const [open, setOpen] = useState(false); // false | "hover" | "pinned"
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const tipRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || !ref.current || !tipRef.current) return;
    const r = ref.current.getBoundingClientRect();
    const w = tipRef.current.offsetWidth;
    const h = tipRef.current.offsetHeight;
    const left = Math.max(EDGE, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - EDGE));
    const below = r.bottom + GAP + h <= window.innerHeight - EDGE;
    setPos({ left, top: below ? r.bottom + GAP : Math.max(EDGE, r.top - GAP - h) });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (!tip) return children;
  return (
    <>
      <button
        type="button"
        ref={ref}
        className="lg-term"
        lang={lang}
        aria-expanded={Boolean(open)}
        aria-describedby={open ? id : undefined}
        // A tap sends mouseenter just before click, so it ends up pinned too.
        onMouseEnter={() => setOpen((o) => o || "hover")}
        onMouseLeave={() => setOpen((o) => (o === "hover" ? false : o))}
        onClick={() => setOpen((o) => (o === "pinned" ? false : "pinned"))}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <span
            ref={tipRef}
            id={id}
            role="tooltip"
            lang={lang}
            className="lg-term-tip"
            style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}
          >
            <strong className="lg-term-tip__title">{tip.title}</strong>
            <span className="lg-term-tip__letters" lang="en">{tip.letters}</span>
            <span className="lg-term-tip__note">{tip.note}</span>
          </span>,
          document.body
        )}
    </>
  );
}
