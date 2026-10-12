import { fireEvent, screen } from "@testing-library/react";
import { renderApp } from "../test-utils";

describe("Home", () => {
  it("shows a card per game and opens hangman", () => {
    renderApp("/");
    expect(screen.getByText("Word Pairs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: /Word Hangman/ }));
    expect(screen.getByRole("button", { name: "Start Game" })).toBeInTheDocument();
  });

  it("starts a hangman game from the setup screen in one tap", () => {
    renderApp("/hangman");
    fireEvent.click(screen.getByRole("button", { name: "Start Game" }));
    expect(screen.getByTestId("native-word")).toBeInTheDocument();
  });

  it("switches the interface to Finnish", () => {
    renderApp("/");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Suomi" }));
    expect(screen.getByText("Valitse peli")).toBeInTheDocument();
  });
});
