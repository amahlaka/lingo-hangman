import { fireEvent, screen, within } from "@testing-library/react";
import { renderApp } from "../test-utils";

describe("Home", () => {
  it("shows a card per game and opens hangman", () => {
    renderApp("/");
    expect(screen.getByText("Word Pairs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: /Word Hangman/ }));
    // No setup screen: hangman starts right away with words from the word bank.
    expect(screen.getByTestId("native-word")).toBeInTheDocument();
  });

  it("plays your own words from the custom words page", () => {
    renderApp("/hangman/words");
    fireEvent.change(screen.getByLabelText("Learning language word"), { target: { value: "cat" } });
    fireEvent.change(screen.getByLabelText("Native translation"), { target: { value: "kissa" } });
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    expect(screen.getByTestId("native-word")).toHaveTextContent("kissa");
  });

  it("switches the interface to Finnish", () => {
    renderApp("/");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Suomi" }));
    expect(screen.getByText("Valitse peli")).toBeInTheDocument();
  });

  it("keeps settings in compact rows and links every page from the menu", () => {
    renderApp("/");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("group", { name: "Daily goal (words)" })).toBeInTheDocument();
    const menu = screen.getByRole("dialog", { name: "Settings" });
    for (const name of ["Practice settings", "Your profile", "Shop"]) {
      expect(within(menu).getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("has a bottom navigation bar on Home and the top-level screens, not in games", () => {
    renderApp("/");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(within(nav).getByRole("link", { name: "Shop" }));
    const shopNav = screen.getByRole("navigation", { name: "Main" });
    expect(within(shopNav).getByRole("link", { name: "Shop" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(within(shopNav).getByRole("link", { name: "Lessons" }));
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Quick play" }));
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
  });
});
