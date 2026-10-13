import { fireEvent, screen } from "@testing-library/react";
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
});
