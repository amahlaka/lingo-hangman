import { fireEvent, screen } from "@testing-library/react";
import { memoryStorage, renderApp } from "../test-utils";
import { STORAGE_KEY, emptyProgress, recordWord } from "../lib/progress";
import { encodeWords, filterCommonWords } from "../lib/words";

const saved = (state) => memoryStorage({ [STORAGE_KEY]: JSON.stringify(state) });
const read = (storage) => JSON.parse(storage.data[STORAGE_KEY]);

describe("Quick play", () => {
  it("has a card on the home screen", () => {
    renderApp("/");
    fireEvent.click(screen.getByRole("link", { name: /Quick play/ }));
    expect(screen.getByText("1 of 10")).toBeInTheDocument();
  });

  it("starts with an easy win and mixes in challenges from the learner's own answers", () => {
    const words = filterCommonWords({ learningLang: "en-GB", nativeLang: "fi" }).slice(0, 8);
    let state = emptyProgress();
    for (const w of words.slice(0, 4)) {
      for (let i = 0; i < 2; i++) state = recordWord(state, { gameId: "meaning", word: w.learning, lang: "en-GB", solved: true, perfect: true, ms: 2000 }).state;
    }
    for (const w of words.slice(4)) {
      state = recordWord(state, { gameId: "meaning", word: w.learning, lang: "en-GB", solved: false, ms: 9000 }).state;
    }
    renderApp("/quick", { storage: saved(state) });
    expect(screen.getByText("Easy win")).toBeInTheDocument();
    expect(screen.getByText(/A mix of games/)).toBeInTheDocument();
  });

  it("records how long each answer took", () => {
    const pairs = [
      { learning: "dog", native: "koira" },
      { learning: "cat", native: "kissa" },
      { learning: "bird", native: "lintu" },
      { learning: "fish", native: "kala" },
    ];
    const { storage } = renderApp(`/meaning?words=${encodeWords(pairs)}&learningLang=en-GB&nativeLang=fi`);
    const native = screen.getByTestId("prompt-word").textContent;
    fireEvent.click(screen.getByRole("button", { name: pairs.find((p) => p.native === native).learning }));
    const state = read(storage);
    expect(state.stats.games.meaning).toMatchObject({ n: 1, solved: 1, timed: 1 });
    expect(state.words[`en-GB:${pairs.find((p) => p.native === native).learning}`].recent).toBe("2");
  });

  it("shows answer statistics on the home screen once there are enough", () => {
    let state = emptyProgress();
    for (let i = 0; i < 6; i++) state = recordWord(state, { gameId: "meaning", word: `m${i}`, solved: true, perfect: true, ms: 2000 }).state;
    for (let i = 0; i < 6; i++) state = recordWord(state, { gameId: "phrase", word: `p${i}`, solved: true, ms: 8000 }).state;
    renderApp("/", { storage: saved(state) });
    expect(screen.getByRole("heading", { name: "Your answers" })).toBeInTheDocument();
    expect(screen.getByText("5.0 s")).toBeInTheDocument();
    expect(screen.getByText("Takes you longest").nextSibling).toHaveTextContent("Build the phrase");
    expect(screen.getByText("Quickest for you").nextSibling).toHaveTextContent("Pick the meaning");
  });
});
