import React from "react";
import { Plus, X } from "lucide-react";

// Form for one word bank item. Edits go straight to onChange(newItem); empty
// optional fields are dropped when the files are written (see tidyItem).

// "" in a list means "no word" (e.g. no article); it is typed as NO_WORD.
const NO_WORD = "(no word)";
const listText = (list) => (list || []).map((w) => (w === "" ? NO_WORD : w)).join(", ");
const toList = (text) =>
  text.split(",").map((s) => s.trim()).filter(Boolean).map((w) => (w === NO_WORD ? "" : w));

function Field({ label, hint, children }) {
  return (
    <label className="lg-field wb-field">
      <span>{label}</span>
      {children}
      {hint && <span className="lg-caption">{hint}</span>}
    </label>
  );
}

function TextInput({ value, onChange, ...rest }) {
  return <input className="lg-input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

// Comma-separated list kept as typed until the field loses focus, so typing
// "a, " doesn't jump.
function ListInput({ value, onChange, ...rest }) {
  const [text, setText] = React.useState(listText(value));
  const outside = listText(value);
  React.useEffect(() => {
    setText((t) => (listText(toList(t)) === outside ? t : outside));
  }, [outside]);
  return (
    <input
      className="lg-input"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(toList(e.target.value));
      }}
      onBlur={() => setText(listText(value))}
      {...rest}
    />
  );
}

// { en: "...", fi: "..." } with one input per language in `langs`.
function TextMap({ label, value = {}, langs, onChange, multiline = false, labels: extraLabels = {} }) {
  const labels = { en: "English", fi: "Finnish", ...extraLabels };
  const shown = Array.from(new Set([...langs, ...Object.keys(value)]));
  const Input = multiline ? "textarea" : "input";
  return (
    <fieldset className="wb-fieldset">
      <legend>{label}</legend>
      <div className="wb-grid">
        {shown.map((lang) => (
          <label key={lang} className="lg-field wb-field">
            <span>{labels[lang] || lang}</span>
            <Input
              className="lg-input"
              rows={multiline ? 3 : undefined}
              value={value[lang] ?? ""}
              onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Rows({ label, rows = [], onChange, blank, render, addLabel }) {
  const set = (i, row) => onChange(rows.map((r, j) => (j === i ? row : r)));
  return (
    <fieldset className="wb-fieldset">
      <legend>{label}</legend>
      <div className="lg-stack">
        {rows.map((row, i) => (
          <div key={i} className="wb-rowitem">
            <div className="wb-grid">{render(row, (r) => set(i, r))}</div>
            <button type="button" className="lg-btn lg-btn--quiet lg-icon-btn" aria-label={`Remove ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        ))}
        <div>
          <button type="button" className="lg-btn lg-btn--secondary" onClick={() => onChange([...rows, blank()])}>
            <Plus size={18} aria-hidden="true" /> {addLabel}
          </button>
        </div>
      </div>
    </fieldset>
  );
}

const EN_FI = ["en", "fi"];

function Examples({ item, set }) {
  return (
    <Rows
      label="Example sentences"
      addLabel="Add example"
      rows={item.examples}
      blank={() => ({ en: "", fi: "" })}
      onChange={(examples) => set({ examples })}
      render={(ex, change) => (
        <>
          <Field label="English"><TextInput value={ex.en} onChange={(en) => change({ ...ex, en })} /></Field>
          <Field label="Finnish"><TextInput value={ex.fi} onChange={(fi) => change({ ...ex, fi })} /></Field>
        </>
      )}
    />
  );
}

export default function ItemForm({ item, onChange, languages, topics, categories }) {
  const set = (patch) => onChange({ ...item, ...patch });
  const languageLabels = Object.fromEntries(languages.map((l) => [l.code, `${l.label} (${l.code})`]));

  const common = (
    <div className="wb-grid">
      <Field label="Id" hint="Lower case and dashes. Keep it once the item is live.">
        <TextInput value={item.id} onChange={(id) => set({ id })} spellCheck={false} />
      </Field>
      {item.type !== "group" && (
        <Field label="Level" hint="1 beginner, 2 intermediate, 3 harder. Optional.">
          <select className="lg-input" value={item.level ?? ""} onChange={(e) => set({ level: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">Not set</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </Field>
      )}
      {(item.type === "word" || item.type === "gap") && (
        <Field label="Categories" hint={`Comma separated. In use: ${categories.join(", ")}`}>
          <ListInput value={item.categories} onChange={(c) => set({ categories: c.map((x) => x.toLowerCase().replace(/\s+/g, "-")) })} />
        </Field>
      )}
    </div>
  );

  return (
    <div className="lg-stack">
      {common}

      {item.type === "word" && (
        <>
          <TextMap
            label="The word or phrase in each language"
            value={item.text}
            langs={languages.map((l) => l.code)}
            labels={languageLabels}
            onChange={(text) => set({ text })}
          />
          <p className="lg-caption">English is required. Leave a language empty if you don't know it; British spelling is only needed when it differs.</p>
          <Examples item={item} set={set} />
        </>
      )}

      {item.type === "gap" && (
        <>
          <Field label="Sentence" hint="Write ___ (three underscores) where the missing word goes.">
            <TextInput value={item.sentence} onChange={(sentence) => set({ sentence })} />
          </Field>
          <div className="wb-grid">
            <Field label="Right answers" hint={`Comma separated. The first is shown as the answer. Type ${NO_WORD} for "nothing goes here".`}>
              <ListInput value={item.answers} onChange={(answers) => set({ answers })} />
            </Field>
            <Field label="Wrong options" hint="Comma separated. Must really be wrong in this sentence.">
              <ListInput value={item.distractors} onChange={(distractors) => set({ distractors })} />
            </Field>
            <Field label="Practises" hint="The grammar rule or mixed-up words this sentence is for. Optional.">
              <select className="lg-input" value={item.topic ?? ""} onChange={(e) => set({ topic: e.target.value || undefined })}>
                <option value="">Nothing in particular</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <TextMap label="Translation" value={item.translation} langs={["fi"]} onChange={(translation) => set({ translation })} />
          <TextMap label="Explanation shown after answering (optional)" value={item.explanation} langs={["fi"]} multiline onChange={(explanation) => set({ explanation })} />
        </>
      )}

      {item.type === "rule" && (
        <>
          <TextMap label="Title" value={item.title} langs={EN_FI} onChange={(title) => set({ title })} />
          <TextMap label="Explanation" value={item.explanation} langs={EN_FI} multiline onChange={(explanation) => set({ explanation })} />
          <Examples item={item} set={set} />
        </>
      )}

      {item.type === "confusable" && (
        <>
          <TextMap label="Title" value={item.title} langs={EN_FI} onChange={(title) => set({ title })} />
          <Rows
            label="The words that get mixed up"
            addLabel="Add word"
            rows={item.words}
            blank={() => ({ text: "", meaning: { fi: "" } })}
            onChange={(words) => set({ words })}
            render={(w, change) => (
              <>
                <Field label="English word"><TextInput value={w.text} onChange={(text) => change({ ...w, text })} /></Field>
                <Field label="Meaning in Finnish"><TextInput value={w.meaning?.fi} onChange={(fi) => change({ ...w, meaning: { ...w.meaning, fi } })} /></Field>
                <Field label="Note (optional)"><TextInput value={w.note?.fi} onChange={(fi) => change({ ...w, note: { ...w.note, fi } })} /></Field>
              </>
            )}
          />
          <TextMap label="How to tell them apart" value={item.explanation} langs={EN_FI} multiline onChange={(explanation) => set({ explanation })} />
        </>
      )}

      {item.type === "group" && (
        <>
          <TextMap label="Title" value={item.title} langs={EN_FI} onChange={(title) => set({ title })} />
          <Field label="Words" hint="Comma separated. Games use the others as wrong options when one of these is the answer.">
            <ListInput value={item.words} onChange={(words) => set({ words })} />
          </Field>
        </>
      )}
    </div>
  );
}
