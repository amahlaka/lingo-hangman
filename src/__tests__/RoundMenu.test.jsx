import { act, fireEvent, screen } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { GAMES } from "../games/registry";
import { roundChoices, roundsFrom, roundsPath } from "../lib/rounds";
import { LONG_PRESS_MS } from "../components/lingo/RoundCard";
import { quickQuota } from "../games/quick/quickLogic";
import { typeSentences } from "../games/type/typeLogic";

const game = (id) => GAMES.find((g) => g.id === id);

describe("round lengths", () => {
  it("reads the asked length and falls back to the game's own", () => {
    expect(roundsFrom("5", 10)).toBe(5);
    expect([null, "0", "-2", "2.5", "lots", "50"].map((v) => roundsFrom(v, 10))).toEqual([10, 10, 10, 10, 10, 10]);
    expect(roundsFrom("4", 2, { max: 3 })).toBe(2);
  });

  it("offers every game a menu except Daily word", () => {
    expect(roundChoices(game("daily"))).toBeNull();
    expect(roundChoices(game("meaning")).options).toEqual([1, 5, 10]);
    expect(roundChoices(game("read")).options).toEqual([1, 2, 3]);
    expect(roundChoices(game("rush"))).toMatchObject({ options: [30, 60, 90], unit: "second" });
    expect(roundsPath(game("hangman"), 10)).toBe("/hangman?rounds=10");
    // The Sounds of English card opens the lesson list; its menu plays a mix.
    expect(roundsPath(game("sounds"), 5)).toBe("/sounds?set=mix&rounds=5");
  });

  it("keeps the same share of easy wins, challenges and sentences", () => {
    expect(quickQuota(10)).toEqual({ easy: 3, challenge: 3 });
    expect(quickQuota(5)).toEqual({ easy: 1, challenge: 1 });
    expect(quickQuota(1)).toEqual({ easy: 0, challenge: 0 });
    expect([1, 5, 10].map(typeSentences)).toEqual([0, 2, 4]);
  });
});

describe("round menu on the game cards", () => {
  afterEach(() => jest.useRealTimers());

  it("opens from the ⋯ button with a tip, and plays the length picked", () => {
    renderApp("/");
    fireEvent.click(screen.getByRole("button", { name: "Choose how long to play Word Hangman" }));
    expect(screen.getByRole("menu", { name: "Word Hangman: How long?" })).toBeInTheDocument();
    expect(screen.getByText("Tip: press and hold a game to choose this.")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["1 round", "5 rounds", "10 rounds"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "10 rounds" }));
    expect(screen.getByText("Round 1 / 10")).toBeInTheDocument();
  });

  it("opens on a long press without starting the game", () => {
    jest.useFakeTimers();
    renderApp("/");
    const card = screen.getByRole("link", { name: /Pick the meaning/ });
    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 10 });
    act(() => jest.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.pointerUp(card);
    fireEvent.click(card);
    expect(screen.getByRole("menu", { name: "Pick the meaning: How long?" })).toBeInTheDocument();
    expect(screen.queryByText("Tip: press and hold a game to choose this.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "1 round" }));
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
  });

  it("treats a scroll as no press and a short tap as play", () => {
    jest.useFakeTimers();
    renderApp("/");
    const card = screen.getByRole("link", { name: /Pick the meaning/ });
    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 10 });
    // The browser cancels the pointer once the page starts to scroll.
    fireEvent.pointerCancel(card);
    act(() => jest.advanceTimersByTime(LONG_PRESS_MS));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(card);
    expect(screen.getByText("1 of 10")).toBeInTheDocument();
  });

  it("opens on a right-click, closes on Escape and names the unit per game", () => {
    renderApp("/");
    fireEvent.contextMenu(screen.getByRole("link", { name: /Word rush/ }));
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["30 seconds", "60 seconds", "90 seconds"]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.contextMenu(screen.getByRole("link", { name: /Word Pairs/ }));
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["1 board", "2 boards", "4 boards"]);
    expect(screen.queryByRole("button", { name: /Choose how long to play Daily word/ })).not.toBeInTheDocument();
  });

  it("puts a menu on the Quick play card too", () => {
    renderApp("/");
    expect(screen.getByRole("button", { name: "Choose how long to play Quick play" })).toBeInTheDocument();
  });

  it("starts Word rush with the clock picked", () => {
    renderApp("/word-rush?rounds=30");
    expect(screen.getByText(/30/, { selector: ".wr-ready__clock" })).toBeInTheDocument();
  });
});
