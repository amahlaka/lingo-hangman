import { fireEvent, screen } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { encodeWords } from "../lib/words";

const words = [
  { learning: "dog", native: "koira" },
  { learning: "kitchen", native: "keittiö" },
  { learning: "bird", native: "lintu" },
  { learning: "window", native: "ikkuna" },
];
const link = `/type-it?words=${encodeWords(words)}&learningLang=en-GB&nativeLang=fi`;
const target = () => words.find((w) => w.native === screen.getByTestId("prompt-word").textContent).learning;
const input = () => screen.getByLabelText("In English");
const type = (text) => {
  fireEvent.change(input(), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Check" }));
};

describe("Type it", () => {
  it("is listed on the home screen", () => {
    renderApp("/");
    expect(screen.getByRole("link", { name: /Type it/ })).toBeInTheDocument();
  });

  it("accepts the typed word without minding capitals and records it", () => {
    const { storage } = renderApp(link);
    const answer = target();
    type(answer.toUpperCase() + " ");
    expect(screen.getByText(`Yes, "${answer}" is right.`)).toBeInTheDocument();
    expect(JSON.stringify(storage.data)).toContain(`en-GB:${answer}`);
    expect(JSON.stringify(storage.data)).toContain("type-it");
  });

  it("gives three tries, then shows the answer", () => {
    renderApp(link);
    const answer = target();
    type("zzzz");
    expect(screen.getByText("Not quite. Try again.")).toBeInTheDocument();
    expect(screen.getByText("2 tries left")).toBeInTheDocument();
    type(answer.slice(0, -1) + "x");
    expect(screen.getByText("So close. Check the spelling.")).toBeInTheDocument();
    type("qqqq");
    expect(screen.getByText(`Not this time. The answer was "${answer}".`)).toBeInTheDocument();
  });

  it("sells hints for the round's points", () => {
    renderApp(link);
    const shape = () => screen.getByRole("button", { name: /Show first letters/ });
    expect(shape()).toBeDisabled();
    expect(screen.getByText(/Earn 2 points to unlock hints/)).toBeInTheDocument();
    type(target());
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const answer = target();
    fireEvent.click(shape());
    expect(screen.getByLabelText("The shape of the answer")).toHaveTextContent(answer[0]);
    expect(screen.queryByRole("button", { name: /Show first letters/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next letter/ }));
    expect(input()).toHaveValue(answer[0]);
  });
});
