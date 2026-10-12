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
    fireEvent.keyDown(window, { key: "Enter", code: "Enter" });
    expect(screen.getByText("You've practised every word in this set.")).toBeInTheDocument();
  });

  it("runs out of tries, shows the answer calmly and brings the word back", () => {
    renderApp(CAT_LINK);
    ["Z", "X", "Y", "Q", "B", "W"].forEach((l) => fireEvent.click(key(l)));
    expect(screen.getByTestId("guessed")).toHaveTextContent('Not this time. The word was "cat".');
    fireEvent.click(screen.getByRole("button", { name: "Next Word" }));
    expect(screen.getByTestId("native-word")).toHaveTextContent("kissa");
    expect(screen.getByText("Round 2 / 2")).toBeInTheDocument();
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

  it("buys a hint with points earned in the session", () => {
    jest.useFakeTimers();
    const two = encodeWords([
      { learning: "cat", native: "kissa" },
      { learning: "dog", native: "koira" },
    ]);
    renderApp(`/play?words=${two}`);
    const first = screen.getByTestId("native-word").textContent.includes("kissa") ? "CAT" : "DOG";
    first.split("").forEach((l) => fireEvent.click(key(l)));
    fireEvent.click(screen.getByRole("button", { name: "Next Word" }));
    const remove = screen.getByRole("button", { name: /^Remove a letter/ });
    expect(remove).toBeEnabled();
    fireEvent.click(remove);
    expect(screen.getAllByRole("button", { name: /, removed$/ })).toHaveLength(1);
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });
});
