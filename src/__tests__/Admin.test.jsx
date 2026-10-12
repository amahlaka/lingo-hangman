import { fireEvent, screen, within } from "@testing-library/react";
import { renderApp } from "../test-utils";

beforeEach(() => window.localStorage.clear());

describe("word bank admin", () => {
  it("adds a word, flags what is missing and lists the changed file", () => {
    renderApp("/admin");
    expect(screen.getByRole("heading", { name: "Word bank" })).toBeInTheDocument();
    expect(screen.getByText("No changes yet.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Add to this pack/ }));
    const editor = screen.getByRole("region", { name: "Edit item" });
    expect(within(editor).getByText(/^text needs/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();

    fireEvent.change(within(editor).getByLabelText("English (US) (en)"), { target: { value: "moose" } });
    fireEvent.change(within(editor).getByLabelText("Finnish (fi)"), { target: { value: "hirvi" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Make id from text" }));

    expect(within(editor).queryByText(/^text needs/)).not.toBeInTheDocument();
    expect(within(editor).getByLabelText(/^Id/)).toHaveValue("moose");
    expect(screen.getByText("Changed: packs/everyday-words.json")).toBeInTheDocument();
    // Still needs a token before it can publish.
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });
});
