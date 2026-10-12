import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { GameScreen } from "../components/lingo";
import { getContent } from "../lib/content";
import { ITEM_TYPES, validateContent, validateItem, contentContext } from "../lib/contentSchema";
import { TYPE_NAMES, blankItem, changedFiles, draftFrom, itemLabel, suggestId, tidyDraft, tidyItem } from "./adminDraft";
import { PublishConflict, publishToGitHub } from "./githubPublish";
import ItemForm from "./ItemForm";

// /admin: edit the word bank in the browser and publish it as one commit to
// the word base repository (amahlaka/lingo-wordbase), without a pull request.
// The "Content publish" workflow then puts it on the live site. See that
// repository's README.

const DRAFT_KEY = "lingo-admin-draft-v1";
const GITHUB_KEY = "lingo-admin-github";
const DEFAULT_GITHUB = { token: "", repo: "amahlaka/lingo-wordbase", branch: "master" };

function readStored(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeStored(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: the draft just isn't kept */
  }
}

function download(path, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = path.split("/").pop();
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ContentAdmin() {
  const [original, setOriginal] = useState(() => draftFrom(getContent().raw));
  const [restored] = useState(() => Boolean(readStored(DRAFT_KEY)));
  const [draft, setDraft] = useState(() => readStored(DRAFT_KEY) || draftFrom(getContent().raw));
  const [packId, setPackId] = useState(() => draft.index.packs[0]);
  const [typeFilter, setTypeFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null); // index in the pack's items
  const [newType, setNewType] = useState("word");
  const [github, setGithub] = useState(() => ({ ...DEFAULT_GITHUB, ...readStored(GITHUB_KEY) }));
  const [message, setMessage] = useState("");
  const [publishState, setPublishState] = useState({ status: "idle" });

  const changes = useMemo(() => changedFiles(draft, original), [draft, original]);
  const problems = useMemo(() => validateContent(tidyDraft(draft)), [draft]);
  const ctx = useMemo(() => contentContext(tidyDraft(draft)), [draft]);

  useEffect(() => {
    writeStored(DRAFT_KEY, changes.length ? draft : null);
  }, [draft, changes.length]);

  // On narrow screens the editor sits under the list, so bring it into view.
  useEffect(() => {
    if (selected === null || !window.matchMedia?.("(max-width: 899px)").matches) return;
    document.querySelector(".wb-editor")?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [selected, packId]);

  const pack = draft.packs.find((p) => p.id === packId) || draft.packs[0];
  const allItems = draft.packs.flatMap((p) => p.items);
  const takenIds = new Set(allItems.map((i) => i.id));
  const topics = allItems
    .filter((i) => i.type === "rule" || i.type === "confusable")
    .map((i) => ({ id: i.id, label: `${itemLabel(i)} (${TYPE_NAMES[i.type].toLowerCase()})` }));
  const categories = Array.from(new Set([...Object.keys(draft.index.categories || {}), ...allItems.flatMap((i) => i.categories || [])])).sort();

  const q = query.trim().toLowerCase();
  const visible = (pack?.items || [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => (!typeFilter || item.type === typeFilter) && (!q || JSON.stringify(item).toLowerCase().includes(q)));

  const updatePack = (id, fn) => setDraft((d) => ({ ...d, packs: d.packs.map((p) => (p.id === id ? fn(p) : p)) }));
  const setItem = (index, item) => updatePack(pack.id, (p) => ({ ...p, items: p.items.map((it, i) => (i === index ? item : it)) }));
  const addItem = () => {
    const item = blankItem(newType, takenIds);
    updatePack(pack.id, (p) => ({ ...p, items: [...p.items, item] }));
    setSelected(pack.items.length);
    setTypeFilter("");
    setQuery("");
  };
  const removeItem = (index) => {
    if (!window.confirm(`Remove "${itemLabel(pack.items[index])}"?`)) return;
    updatePack(pack.id, (p) => ({ ...p, items: p.items.filter((_, i) => i !== index) }));
    setSelected(null);
  };

  const current = selected !== null ? pack?.items[selected] : null;
  const currentProblems = current ? validateItem(tidyItem(current), ctx) : [];

  const savePublishSettings = (patch) => {
    const next = { ...github, ...patch };
    setGithub(next);
    writeStored(GITHUB_KEY, next);
  };

  const defaultMessage = `Update word bank: ${changes.map((c) => c.path.split("/").pop().replace(".json", "")).join(", ")}`;

  const publish = async () => {
    setPublishState({ status: "working" });
    try {
      const result = await publishToGitHub({ ...github, files: changes, message: message.trim() || defaultMessage });
      setOriginal(JSON.parse(JSON.stringify(draft)));
      setMessage("");
      setPublishState({ status: "done", url: result.url });
    } catch (err) {
      setPublishState({ status: "error", message: err instanceof PublishConflict ? err.message : String(err.message || err) });
    }
  };

  const discard = () => {
    if (!window.confirm("Throw away every change that isn't published?")) return;
    setDraft(JSON.parse(JSON.stringify(original)));
    setSelected(null);
  };

  return (
    <GameScreen title="Word bank">
      <main className="lg-board lg-page wb-page">
        <p className="lg-body-lg">
          Add and edit words, sentences, grammar rules and languages. Changes stay on this device until you publish them.
        </p>
        {restored && changes.length > 0 && (
          <p className="lg-note lg-note--info wb-note">Your unpublished changes from last time are still here.</p>
        )}

        <section className="lg-section">
          <div className="wb-grid">
            <label className="lg-field">
              <span>Pack</span>
              <select className="lg-input" value={pack?.id} onChange={(e) => { setPackId(e.target.value); setSelected(null); }}>
                {draft.packs.map((p) => (
                  <option key={p.id} value={p.id}>{p.title?.en || p.id} ({p.items.length})</option>
                ))}
              </select>
            </label>
            <label className="lg-field">
              <span>Show</span>
              <select className="lg-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">Everything</option>
                {ITEM_TYPES.map((t) => <option key={t} value={t}>{TYPE_NAMES[t]}</option>)}
              </select>
            </label>
            <label className="lg-field">
              <span>Search</span>
              <input className="lg-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>
          <div className="lg-row">
            <select className="lg-input wb-inline" aria-label="Type of new item" value={newType} onChange={(e) => setNewType(e.target.value)}>
              {ITEM_TYPES.map((t) => <option key={t} value={t}>{TYPE_NAMES[t]}</option>)}
            </select>
            <button type="button" className="lg-btn lg-btn--secondary" onClick={addItem} disabled={!pack}>
              <Plus size={18} aria-hidden="true" /> Add to this pack
            </button>
          </div>
        </section>

        <div className="wb-layout">
          <ul className="wb-list" aria-label="Items">
            {visible.map(({ item, index }) => {
              const bad = validateItem(tidyItem(item), ctx).length > 0;
              return (
                <li key={index}>
                  <button
                    type="button"
                    className={`wb-item ${selected === index ? "wb-item--on" : ""}`}
                    aria-current={selected === index}
                    onClick={() => setSelected(index)}
                  >
                    <span className="wb-item__text">{itemLabel(item) || "(empty)"}</span>
                    <span className="lg-caption">{TYPE_NAMES[item.type] || item.type}{bad ? " · needs fixing" : ""}</span>
                  </button>
                </li>
              );
            })}
            {visible.length === 0 && <li className="lg-caption">Nothing here yet.</li>}
          </ul>

          {current && (
            <section className="wb-editor lg-stack" aria-label="Edit item">
              <div className="lg-row wb-editor__head">
                <h2 className="lg-heading">{TYPE_NAMES[current.type]}</h2>
                <button type="button" className="lg-btn lg-btn--quiet" onClick={() => setItem(selected, { ...current, id: suggestId(current, new Set([...takenIds].filter((id) => id !== current.id))) })}>
                  Make id from text
                </button>
                <button type="button" className="lg-btn lg-btn--quiet" onClick={() => removeItem(selected)}>
                  <Trash2 size={18} aria-hidden="true" /> Remove
                </button>
              </div>
              {currentProblems.length > 0 && (
                <ul className="wb-problems">
                  {currentProblems.map((p) => <li key={p}>{p}</li>)}
                </ul>
              )}
              <ItemForm
                item={current}
                onChange={(item) => setItem(selected, item)}
                languages={draft.languages}
                topics={topics}
                categories={categories}
              />
            </section>
          )}
        </div>

        <details className="lg-details">
          <summary className="lg-heading">Packs and categories</summary>
          <PacksAndCategories draft={draft} setDraft={setDraft} categories={categories} onAdded={setPackId} />
        </details>

        <details className="lg-details">
          <summary className="lg-heading">Languages</summary>
          <Languages draft={draft} setDraft={setDraft} />
        </details>

        <section className="lg-section wb-publish">
          <h2 className="lg-heading">Publish</h2>
          {changes.length === 0 ? (
            <p className="lg-caption">No changes yet.</p>
          ) : (
            <p>Changed: {changes.map((c) => c.path).join(", ")}</p>
          )}
          {problems.length > 0 && (
            <>
              <p>Fix these first:</p>
              <ul className="wb-problems">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </>
          )}
          <details className="lg-details">
            <summary>GitHub access</summary>
            <div className="lg-stack">
              <p className="lg-caption">
                Publishing needs a GitHub fine-grained access token with only the word base repository selected and
                "Contents: read and write". It can change words but not the app. It is kept only in this browser.
              </p>
              <div className="wb-grid">
                <label className="lg-field">
                  <span>Access token</span>
                  <input className="lg-input" type="password" autoComplete="off" value={github.token} onChange={(e) => savePublishSettings({ token: e.target.value.trim() })} />
                </label>
                <label className="lg-field">
                  <span>Repository</span>
                  <input className="lg-input" value={github.repo} onChange={(e) => savePublishSettings({ repo: e.target.value.trim() })} />
                </label>
                <label className="lg-field">
                  <span>Branch</span>
                  <input className="lg-input" value={github.branch} onChange={(e) => savePublishSettings({ branch: e.target.value.trim() })} />
                </label>
              </div>
            </div>
          </details>
          <label className="lg-field">
            <span>What changed (optional)</span>
            <input className="lg-input" placeholder={changes.length ? defaultMessage : ""} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          <div className="lg-row">
            <button
              type="button"
              className="lg-btn lg-btn--primary"
              onClick={publish}
              disabled={!changes.length || problems.length > 0 || !github.token || publishState.status === "working"}
            >
              {publishState.status === "working" ? "Publishing…" : "Publish"}
            </button>
            <button type="button" className="lg-btn lg-btn--secondary" disabled={!changes.length} onClick={() => changes.forEach((c) => download(c.path, c.content))}>
              Download changed files
            </button>
            <button type="button" className="lg-btn lg-btn--quiet" disabled={!changes.length} onClick={discard}>
              Discard changes
            </button>
          </div>
          {publishState.status === "done" && (
            <p className="lg-note lg-note--correct wb-note">
              Published as <a href={publishState.url} target="_blank" rel="noreferrer">one commit</a>. The live site picks it up in a few minutes.
            </p>
          )}
          {publishState.status === "error" && <p className="lg-note lg-note--retry wb-note">{publishState.message}</p>}
        </section>
      </main>
    </GameScreen>
  );
}

function PacksAndCategories({ draft, setDraft, categories, onAdded }) {
  const [newPack, setNewPack] = useState({ id: "", en: "", fi: "" });
  const labels = draft.index.categories || {};
  const setLabel = (cat, lang, text) =>
    setDraft((d) => ({
      ...d,
      index: { ...d.index, categories: { ...d.index.categories, [cat]: { ...(d.index.categories?.[cat] || {}), [lang]: text } } },
    }));
  const addPack = () => {
    const id = newPack.id.trim();
    if (!id || draft.packs.some((p) => p.id === id)) return;
    const title = { en: newPack.en.trim() || id, ...(newPack.fi.trim() ? { fi: newPack.fi.trim() } : {}) };
    setDraft((d) => ({ ...d, index: { ...d.index, packs: [...d.index.packs, id] }, packs: [...d.packs, { id, title, items: [] }] }));
    setNewPack({ id: "", en: "", fi: "" });
    onAdded(id);
  };
  return (
    <div className="lg-stack">
      <h3 className="lg-heading">New pack</h3>
      <div className="wb-grid">
        <label className="lg-field"><span>Id</span><input className="lg-input" value={newPack.id} onChange={(e) => setNewPack({ ...newPack, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} /></label>
        <label className="lg-field"><span>Name in English</span><input className="lg-input" value={newPack.en} onChange={(e) => setNewPack({ ...newPack, en: e.target.value })} /></label>
        <label className="lg-field"><span>Name in Finnish</span><input className="lg-input" value={newPack.fi} onChange={(e) => setNewPack({ ...newPack, fi: e.target.value })} /></label>
      </div>
      <div><button type="button" className="lg-btn lg-btn--secondary" onClick={addPack} disabled={!newPack.id.trim()}>Add pack</button></div>

      <h3 className="lg-heading">Category names</h3>
      <p className="lg-caption">Shown on the category chips. A category without a name is shown as it is written.</p>
      {categories.map((cat) => (
        <div key={cat} className="wb-grid">
          <span className="wb-cat">{cat}</span>
          <label className="lg-field"><span>English</span><input className="lg-input" value={labels[cat]?.en ?? ""} onChange={(e) => setLabel(cat, "en", e.target.value)} /></label>
          <label className="lg-field"><span>Finnish</span><input className="lg-input" value={labels[cat]?.fi ?? ""} onChange={(e) => setLabel(cat, "fi", e.target.value)} /></label>
        </div>
      ))}
    </div>
  );
}

function Languages({ draft, setDraft }) {
  const set = (i, patch) =>
    setDraft((d) => ({
      ...d,
      languages: d.languages.map((l, j) => {
        if (j !== i) return l;
        const next = { ...l, ...patch };
        // Optional fields are left out of the file when empty.
        for (const key of ["alphabet", "fallback"]) if (next[key] === "") delete next[key];
        return next;
      }),
    }));
  const add = () => setDraft((d) => ({ ...d, languages: [...d.languages, { code: "", label: "" }] }));
  const remove = (i) => {
    const l = draft.languages[i];
    if ((l.code || l.label) && !window.confirm(`Remove the language "${l.label || l.code}"?`)) return;
    setDraft((d) => ({ ...d, languages: d.languages.filter((_, j) => j !== i) }));
  };
  return (
    <div className="lg-stack">
      <p className="lg-caption">
        A new language appears in the word list menus once words have a translation in it. The alphabet is the letters on the hangman keyboard.
      </p>
      {draft.languages.map((l, i) => (
        <div key={i} className="wb-grid">
          <label className="lg-field"><span>Code</span><input className="lg-input" value={l.code ?? ""} onChange={(e) => set(i, { code: e.target.value.trim() })} /></label>
          <label className="lg-field"><span>Name</span><input className="lg-input" value={l.label ?? ""} onChange={(e) => set(i, { label: e.target.value })} /></label>
          <label className="lg-field"><span>Alphabet</span><input className="lg-input" value={l.alphabet ?? ""} onChange={(e) => set(i, { alphabet: e.target.value.toUpperCase().replace(/\s/g, "") })} /></label>
          <label className="lg-field"><span>Falls back to</span><input className="lg-input" value={l.fallback ?? ""} onChange={(e) => set(i, { fallback: e.target.value.trim() })} /></label>
          <button type="button" className="lg-btn lg-btn--quiet lg-icon-btn" aria-label={`Remove language ${l.label || l.code || i + 1}`} onClick={() => remove(i)}>
            <Trash2 size={18} aria-hidden="true" />
          </button>
        </div>
      ))}
      <div><button type="button" className="lg-btn lg-btn--secondary" onClick={add}><Plus size={18} aria-hidden="true" /> Add language</button></div>
    </div>
  );
}
