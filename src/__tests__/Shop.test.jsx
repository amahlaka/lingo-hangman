import { fireEvent, screen } from "@testing-library/react";
import { memoryStorage, renderApp } from "../test-utils";

const saved = (xp) => memoryStorage({ "lingo.progress.v1": JSON.stringify({ xp }) });

describe("Shop", () => {
  afterEach(() => document.documentElement.removeAttribute("style"));

  it("links from home with the balance", () => {
    renderApp("/", { storage: saved(120) });
    fireEvent.click(screen.getByRole("link", { name: /120 points to spend/ }));
    expect(screen.getByRole("heading", { name: "Colour" })).toBeInTheDocument();
  });

  it("buys an accent colour and applies it", () => {
    const { storage } = renderApp("/shop", { storage: saved(300) });
    expect(screen.getByRole("button", { name: "Get Aurora for 400 points" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Get Fjord for 250 points" }));
    expect(screen.getByText("Fjord is yours and in use.")).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue("--lake")).toBe("#0e6668");
    expect(JSON.parse(storage.data["lingo.progress.v1"]).shop).toMatchObject({ spent: 250, owned: ["accent-fjord"] });
    // Back to the free colour.
    fireEvent.click(screen.getByRole("button", { name: "Use Lake" }));
    expect(document.documentElement.style.getPropertyValue("--lake")).toBe("");
  });

  it("dresses the hangman figure", () => {
    const storage = memoryStorage({
      "lingo.progress.v1": JSON.stringify({ xp: 0, shop: { spent: 0, owned: ["figure-crown"], equipped: { figure: "figure-crown" } } }),
    });
    const { container } = renderApp("/shop", { storage });
    expect(container.querySelectorAll(".hm-acc--crown").length).toBeGreaterThan(0);
    expect(screen.getAllByText("In use")).toHaveLength(3);
  });
});
