import { fireEvent, screen } from "@testing-library/react";
import { memoryStorage, renderApp } from "../test-utils";
import { encodeWords } from "../lib/words";

// Every word is long enough for two "Next letter" hints to leave letters still
// hidden: the hint never gives away the last letter, so on a three-letter word
// it disappears after the second one.
const words = [
  { learning: "garden", native: "puutarha" },
  { learning: "kitchen", native: "keittiö" },
  { learning: "flower", native: "kukka" },
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

  it("gives three free hints, then sells hints for the round's points", () => {
    renderApp(link);
    const shape = () => screen.getByRole("button", { name: /Show first letters/ });
    const letter = () => screen.getByRole("button", { name: /Next letter/ });
    expect(screen.getByText("Free hints left in this game: 3")).toBeInTheDocument();
    expect(shape()).toHaveTextContent("Show first letters (free)");
    const first = target();
    fireEvent.click(shape());
    expect(screen.getByLabelText("The shape of the answer")).toHaveTextContent(first[0]);
    expect(screen.getByText("Free hints left in this game: 2")).toBeInTheDocument();
    fireEvent.click(letter());
    expect(input()).toHaveValue(first[0]);
    fireEvent.click(letter());
    expect(input()).toHaveValue(first.slice(0, 2));
    // Free hints are used up and no points are earned yet.
    expect(letter()).toBeDisabled();
    expect(letter()).toHaveTextContent("Next letter (−3 points)");
    expect(screen.getByText(/Earn 3 points to unlock hints/)).toBeInTheDocument();
    type(first);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const points = () => Number(screen.getByLabelText(/^Points \d+$/).getAttribute("aria-label").split(" ")[1]);
    const before = points();
    const answer = target();
    fireEvent.click(shape());
    expect(points()).toBe(before - 2);
    expect(screen.getByLabelText("The shape of the answer")).toHaveTextContent(answer[0]);
    expect(screen.queryByRole("button", { name: /Show first letters/ })).not.toBeInTheDocument();
  });
});

describe("Type it extra tries", () => {
  it("offers an extra try after the last wrong try", () => {
    const storage = memoryStorage({ "lingo.progress.v1": JSON.stringify({ xp: 0, shop: { gems: 0, owned: [], extraTries: 1 } }) });
    renderApp(link, { storage });
    const answer = target();
    type("zzzz");
    type("qqqq");
    type("xxxx");
    expect(screen.getByText("Out of tries")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use an extra try" }));
    expect(screen.getByText("1 try left")).toBeInTheDocument();
    type(answer);
    expect(screen.getByText(`Yes, "${answer}" is right.`)).toBeInTheDocument();
  });
});
