// Home shows at most one offer a day (install the app, create an account,
// turn on reminders), so a visit never opens with a stack of questions. An
// offer claims the day just before it shows; the others then wait for another
// day. The same offer may show again on that day (e.g. after a reload).

const STORAGE_ITEM = "lingo.homeOffer.v1";

const todayKey = () => new Date().toISOString().slice(0, 10);

export function claimHomeOffer(name) {
  try {
    const held = JSON.parse(localStorage.getItem(STORAGE_ITEM) || "null");
    if (held && held.day === todayKey() && held.name !== name) return false;
    localStorage.setItem(STORAGE_ITEM, JSON.stringify({ day: todayKey(), name }));
    return true;
  } catch {
    return true;
  }
}
