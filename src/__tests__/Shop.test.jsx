import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { memoryStorage, renderApp } from "../test-utils";
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
