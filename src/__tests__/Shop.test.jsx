import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { memoryStorage, renderApp } from "../test-utils";
import { encodeWords } from "../lib/words";
import { SettingsProvider } from "../app/SettingsContext";
import GemToast from "../components/lingo/GemToast";

const saved = (gems) => memoryStorage({ "lingo.progress.v1": JSON.stringify({ xp: 5000, shop: { gems, owned: [] } }) });

describe("Shop", () => {
  afterEach(() => document.documentElement.removeAttribute("style"));

  it("links from home with the balance", () => {
    renderApp("/", { storage: saved(120) });
    fireEvent.click(screen.getByRole("link", { name: /120 gems to spend/ }));
    expect(screen.getByRole("heading", { name: "Color" })).toBeInTheDocument();
  });

  it("buys an accent colour and applies it", () => {
    const { storage } = renderApp("/shop", { storage: saved(50) });
    expect(screen.getByRole("button", { name: "Get Aurora for 60 gems" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Get Fjord for 40 gems" }));
    expect(screen.getByText("Fjord is yours and in use.")).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue("--lake")).toBe("#0e6668");
    expect(JSON.parse(storage.data["lingo.progress.v1"]).shop).toMatchObject({ gems: 10, owned: ["accent-fjord"] });
    // Back to the free colour.
    fireEvent.click(screen.getByRole("button", { name: "Use Lake" }));
    expect(document.documentElement.style.getPropertyValue("--lake")).toBe("");
  });

  it("dresses the hangman figure", () => {
    const storage = memoryStorage({
      "lingo.progress.v1": JSON.stringify({ xp: 0, shop: { gems: 0, owned: ["figure-crown"], equipped: { figure: "figure-crown" } } }),
    });
    const { container } = renderApp("/shop", { storage });
    expect(container.querySelectorAll(".hm-acc--crown").length).toBeGreaterThan(0);
    expect(screen.getAllByText("In use")).toHaveLength(3);
  });

  it("shows gems earned and why", () => {
    render(
      <SettingsProvider initialLang="en">
        <GemToast toast={{ n: 6, key: 1, reasons: [{ id: "goal", n: 5 }, { id: "streak", n: 1 }] }} onDone={() => {}} />
      </SettingsProvider>
    );
    expect(screen.getByText("+6 gems")).toBeInTheDocument();
    expect(screen.getByText("Daily goal · Streak day")).toBeInTheDocument();
  });
});

describe("Extra tries", () => {
  const withTries = (gems, extraTries = 0) =>
    memoryStorage({ "lingo.progress.v1": JSON.stringify({ xp: 0, shop: { gems, owned: [], extraTries } }) });
  const saved = (storage) => JSON.parse(storage.data["lingo.progress.v1"]).shop;
  const key = (letter) => screen.getByRole("button", { name: new RegExp(`^${letter}(,|$)`) });

  it("are sold in the shop", () => {
    const storage = withTries(25);
    renderApp("/shop", { storage });
    expect(screen.getByText("You have 0 · 10 gems")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Get Extra try for 10 gems" }));
    expect(screen.getByText("You got an extra try. You have 1.")).toBeInTheDocument();
    expect(saved(storage)).toMatchObject({ gems: 15, extraTries: 1 });
  });

  it("let a learner keep going in Hangman after running out of tries", () => {
    const storage = withTries(0, 1);
    renderApp(`/play?words=${encodeWords([{ learning: "cat", native: "kissa" }])}`, { storage });
    "QWXZJV".split("").forEach((l) => fireEvent.click(key(l)));
    expect(screen.getByText("Out of tries")).toBeInTheDocument();
    expect(screen.getByText("Use an extra try to keep going? You have 1.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use an extra try" }));
    expect(saved(storage).extraTries).toBe(0);
    expect(screen.getByText("1 try left")).toBeInTheDocument();
    "CAT".split("").forEach((l) => fireEvent.click(key(l)));
    expect(screen.getByTestId("guessed")).toHaveTextContent(`Yes, "cat" is right.`);
    expect(screen.getByRole("button", { name: "Next word" })).toBeInTheDocument();
  });

  it("can be bought on the spot, or declined to see the answer", () => {
    const storage = withTries(12);
    renderApp(`/play?words=${encodeWords([{ learning: "cat", native: "kissa" }])}`, { storage });
    "QWXZJV".split("").forEach((l) => fireEvent.click(key(l)));
    fireEvent.click(screen.getByRole("button", { name: "Get one for 10 gems" }));
    expect(saved(storage)).toMatchObject({ gems: 2, extraTries: 0 });
    fireEvent.click(key("B"));
    // 2 gems left: not enough for another, so the word ends.
    expect(screen.queryByText("Out of tries")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next word" })).toBeInTheDocument();
  });
});
