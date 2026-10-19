import { act, fireEvent, screen } from "@testing-library/react";
import { memoryStorage, renderApp } from "../test-utils";
import { emptyProgress, STORAGE_KEY } from "../lib/progress";
import { resetInstall, startInstallWatch } from "../lib/install";
import { claimHomeOffer } from "../lib/homeOffers";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const realUA = navigator.userAgent;

function setUA(ua) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
}

function playedOn(n) {
  const state = emptyProgress();
  for (let d = 1; d <= n; d += 1) state.days[`2026-10-0${d}`] = { words: 3, solved: 3, xp: 30, goalMet: false };
  return memoryStorage({ [STORAGE_KEY]: JSON.stringify(state) });
}

// A browser's install offer, as Chrome sends it.
function offerInstall(outcome = "accepted") {
  const e = new Event("beforeinstallprompt");
  e.prompt = jest.fn(async () => {});
  e.userChoice = Promise.resolve({ outcome });
  act(() => {
    window.dispatchEvent(e);
  });
  return e;
}

beforeAll(() => startInstallWatch());
beforeEach(() => {
  window.localStorage.clear();
  resetInstall();
  setUA(realUA);
});
afterAll(() => setUA(realUA));

test("Home mentions installing once, from the second day, with the browser's dialog", async () => {
  const first = renderApp("/", { storage: playedOn(1) });
  offerInstall();
  expect(screen.queryByText("Lingo as an app")).not.toBeInTheDocument();
  first.unmount();

  const second = renderApp("/", { storage: playedOn(2) });
  const e = offerInstall();
  expect(await screen.findByText("Lingo as an app")).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
  });
  expect(e.prompt).toHaveBeenCalled();
  expect(screen.queryByText("Lingo as an app")).not.toBeInTheDocument();
  second.unmount();

  renderApp("/", { storage: playedOn(2) });
  offerInstall();
  await act(async () => {});
  expect(screen.queryByText("Lingo as an app")).not.toBeInTheDocument();
});

test("on iPhone the hint shows Safari's steps", async () => {
  setUA(IPHONE);
  renderApp("/", { storage: playedOn(2) });
  expect(await screen.findByText("Lingo as an app")).toBeInTheDocument();
  expect(screen.getByText("Then choose Add to Home Screen.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "OK" }));
  expect(screen.queryByText("Lingo as an app")).not.toBeInTheDocument();
});

test("no hint where the browser can't install, or when another offer has the day", async () => {
  const plain = renderApp("/", { storage: playedOn(3) });
  await act(async () => {});
  expect(screen.queryByText("Lingo as an app")).not.toBeInTheDocument();
  plain.unmount();

  setUA(IPHONE);
  claimHomeOffer("account");
  renderApp("/", { storage: playedOn(3) });
  await act(async () => {});
  expect(screen.queryByText("Lingo as an app")).not.toBeInTheDocument();
});

test("the menu links to the install page until the app is installed", async () => {
  const before = renderApp("/");
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  expect(screen.queryByRole("link", { name: "Install the app" })).not.toBeInTheDocument();
  before.unmount();

  renderApp("/install");
  expect(screen.getByText(/This browser can't install apps/)).toBeInTheDocument();
  offerInstall("accepted");
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
  });
  expect(screen.getByText("Lingo is installed on this device.")).toBeInTheDocument();
});

test("iPhone menu entry opens the steps", () => {
  setUA(IPHONE);
  renderApp("/");
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.click(screen.getByRole("link", { name: "Install the app" }));
  expect(screen.getByText("In Safari, tap Share")).toBeInTheDocument();
});
