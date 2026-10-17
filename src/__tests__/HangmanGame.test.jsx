import { act, fireEvent, screen } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { encodeWords } from "../lib/words";
import { STORAGE_KEY } from "../lib/progress";

// A one-word link in the original format: [{"learning":"cat","native":"kissa"}]
const CAT_LINK = "/play?words=W3sibGVhcm5pbmciOiJjYXQiLCJuYXRpdmUiOiJraXNzYSJ9XQ%3D%3D";

const key = (letter) => screen.getByRole("button", { name: new RegExp(`^${letter}(,|$)`) });

describe("HangmanGame", () => {
  it("opens a shared link and shows the meaning", () => {
    renderApp(CAT_LINK);
    expect(screen.getByTestId("native-word")).toHaveTextContent("kissa");
  });

  it("guesses a correct letter", () => {
    renderApp(CAT_LINK);
    fireEvent.click(key("C"));
    expect(screen.getByTestId("letter-0")).toHaveTextContent("C");
    expect(key("C")).toHaveAccessibleName("C, in the word");
  });

  it("marks a letter that is not in the word", () => {
    renderApp(CAT_LINK);
    fireEvent.click(key("Z"));
    expect(screen.getByRole("button", { name: "Z, not in the word" })).toBeDisabled();
    expect(screen.getByLabelText("5 tries left")).toBeInTheDocument();
  });

  it("accepts guesses from the physical keyboard", () => {
    renderApp(CAT_LINK);
    fireEvent.keyDown(window, { key: "a" });
    expect(screen.getByTestId("letter-1")).toHaveTextContent("A");
  });

  it("solves the word, records XP and moves on with Enter", () => {
    const { storage } = renderApp(CAT_LINK);
    ["C", "A", "T"].forEach((l) => fireEvent.click(key(l)));
    expect(screen.getByTestId("guessed")).toHaveTextContent('Yes, "cat" is right.');
    // 10 for the word + 2 x 6 tries left + 5 for no misses
    expect(screen.getByText(/\+27 XP/)).toBeInTheDocument();
    expect(JSON.parse(storage.data[STORAGE_KEY]).xp).toBe(27);
    expect(screen.getByText("New badge: First word.")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Enter", code: "Enter" });
    expect(screen.getByText("You've practiced every word in this set.")).toBeInTheDocument();
  });

  it("shows the Finnish meaning under the word once it is done, and lists the set at the end", () => {
    renderApp(CAT_LINK);
    expect(screen.queryByTestId("meaning-reveal")).not.toBeInTheDocument();
    ["C", "A", "T"].forEach((l) => fireEvent.click(key(l)));
    expect(screen.getByTestId("meaning-reveal")).toHaveTextContent("kissa");
    expect(screen.getByTestId("meaning-reveal")).toHaveAttribute("lang", "fi");
    fireEvent.click(screen.getByRole("button", { name: "Next word" }));
    const recap = screen.getByRole("region", { name: "Words in this set" });
    expect(recap).toHaveTextContent("cat");
    expect(recap).toHaveTextContent("kissa");
  });

  it("runs out of tries, shows the answer calmly and brings the word back", () => {
    renderApp(CAT_LINK);
    ["Z", "X", "Y", "Q", "B", "W"].forEach((l) => fireEvent.click(key(l)));
    expect(screen.getByTestId("guessed")).toHaveTextContent('Not this time. The word was "cat".');
    fireEvent.click(screen.getByRole("button", { name: "Next word" }));
    expect(screen.getByTestId("native-word")).toHaveTextContent("kissa");
    expect(screen.getByText("Round 2 / 2")).toBeInTheDocument();
  });

  it("skips a word: shows it and brings it back later", () => {
    renderApp(CAT_LINK);
    fireEvent.click(screen.getByRole("button", { name: "Skip this word" }));
    expect(screen.getByTestId("guessed")).toHaveTextContent('Not this time. The word was "cat".');
    expect(screen.queryByRole("button", { name: "Skip this word" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next word" }));
    expect(screen.getByText("Round 2 / 2")).toBeInTheDocument();
    expect(screen.queryByTestId("guessed")).not.toBeInTheDocument();
  });

  it("plays a multi-word phrase with fixed punctuation", () => {
    const link = `/play?words=${encodeWords([{ learning: "I'm lost", native: "Olen eksynyt" }])}`;
    renderApp(link);
    ["I", "M", "L", "O", "S", "T"].forEach((l) => fireEvent.click(key(l)));
    expect(screen.getByTestId("guessed")).toHaveTextContent(`Yes, "I'm lost" is right.`);
  });

  it("starts with 5 random words when the link has no word list", () => {
    renderApp("/play?learningLang=en-GB&nativeLang=fi");
    expect(screen.getByText("Round 1 / 5")).toBeInTheDocument();
  });

  it("says the answer with Listen, and again for free on the same word", () => {
    const spoken = [];
    window.SpeechSynthesisUtterance = function (text) {
      this.text = text;
    };
    window.speechSynthesis = { speak: (u) => spoken.push(u.text), cancel() {}, getVoices: () => [] };
    try {
      renderApp(CAT_LINK);
      const listen = screen.getByRole("button", { name: /^Listen\./ });
      expect(listen).toHaveAccessibleName("Listen. Hear the answer said aloud; hearing it again this round is free (free)");
      fireEvent.click(listen);
      expect(spoken).toEqual(["cat"]);
      expect(screen.getByText("2 free")).toBeInTheDocument();
      const again = screen.getByRole("button", { name: "Listen. Listen again (free)" });
      fireEvent.click(again);
      fireEvent.click(again);
      expect(spoken).toEqual(["cat", "cat", "cat"]);
      expect(screen.getByText("2 free")).toBeInTheDocument();
    } finally {
      delete window.speechSynthesis;
      delete window.SpeechSynthesisUtterance;
    }
  });

  it("starts with three free hints, then hints cost points", () => {
    renderApp(`/play?words=${encodeWords([{ learning: "kitchen", native: "keittiö" }])}`);
    const hint = (name) => screen.getByRole("button", { name: new RegExp(`^${name}\\.`) });
    expect(screen.getByText("3 free")).toBeInTheDocument();
    expect(hint("Clear letters")).toHaveAccessibleName("Clear letters. Remove 2 to 6 letters that are not in the word (free)");
    fireEvent.click(hint("Clear letters"));
    fireEvent.click(hint("50-50"));
    expect(screen.getByText("1 free")).toBeInTheDocument();
    fireEvent.click(hint("Clear letters"));
    expect(screen.queryByText(/free$/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Points 0$/)).toBeInTheDocument();
    expect(hint("Clear letters")).toHaveAccessibleName("Clear letters. Remove 2 to 6 letters that are not in the word (25 points)");
    expect(hint("Clear letters")).toBeDisabled();
  });

  it("keeps the 50-50 letters marked until the word is done and sells it once per word", () => {
    jest.useFakeTimers();
    const { container } = renderApp(`/play?words=${encodeWords([{ learning: "kitchen", native: "keittiö" }])}`);
    const fifty = () => screen.getByRole("button", { name: /^50-50\./ });
    fireEvent.click(fifty());
    const marked = () => [...container.querySelectorAll(".lg-key--hint")].map((b) => b.textContent);
    const pair = marked();
    expect(pair).toHaveLength(2);
    act(() => jest.advanceTimersByTime(10000));
    expect(marked()).toEqual(pair);
    // Another guess leaves the pair marked.
    const other = "KITCHEN".split("").find((l) => !pair.includes(l));
    fireEvent.click(key(other));
    expect(marked()).toEqual(pair);
    expect(fifty()).toBeDisabled();
    jest.useRealTimers();
  });
});
