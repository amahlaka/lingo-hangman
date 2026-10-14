// Cosmetic items bought with points in the shop (/shop).
//
// How paying works: every point earned in any game also goes into a shop
// balance that lasts between visits. The balance is lifetime XP minus what the
// learner has spent here, so buying never lowers XP, the level or the daily
// numbers. Hints inside a round still spend that round's points only.
//
// Three kinds, one item of each kind in use at a time:
// - accent: the colour of buttons, links and highlights (the `lake` tokens).
// - confetti: what celebrations throw.
// - figure: something the hangman figure wears.
// The first item of each kind is free and in use by default.
//
// The shop lives in the progress state under `shop`; everything here is a pure
// function over that state, like src/lib/progress.js.

export const SHOP_KINDS = ["accent", "confetti", "figure"];

// Accent colours swap the four `lake` tokens. Every pair keeps the design
// system's contrast: at least 4.5:1 for on-colour text and against surfaces.
// light/dark: [lake, lake-strong, lake-soft, on-lake]
export const ACCENTS = {
  lake: { light: ["#1e5b80", "#164764", "#dceaf2", "#ffffff"], dark: ["#7cc0e6", "#a3d4ef", "#173a50", "#0b1a24"] },
  fjord: { light: ["#0e6668", "#0a4f51", "#d6eeee", "#ffffff"], dark: ["#6fd0cf", "#9be0df", "#123a3b", "#061a1a"] },
  aurora: { light: ["#5b3fa0", "#47308a", "#e8e2f6", "#ffffff"], dark: ["#b9a3f0", "#d0c2f6", "#2c2150", "#150b2a"] },
  heather: { light: ["#8a2f6b", "#6f2456", "#f5e0ee", "#ffffff"], dark: ["#e59ccd", "#f0bfe0", "#45193a", "#2a0a1f"] },
  midnight: { light: ["#33449a", "#26357d", "#e0e5f6", "#ffffff"], dark: ["#a2b2f2", "#c3cef7", "#1f2a55", "#0b1230"] },
};

const ACCENT_TOKENS = ["--lake", "--lake-strong", "--lake-soft", "--on-lake"];

// CSS custom properties for an accent, for the <html> element.
export function accentVars(id, dark) {
  const accent = ACCENTS[id] || ACCENTS.lake;
  const values = dark ? accent.dark : accent.light;
  return Object.fromEntries(ACCENT_TOKENS.map((name, i) => [name, values[i]]));
}

// Confetti sets: colours (CSS values) and the shape of the pieces. `mix` is
// the original strips and dots.
export const CONFETTI = {
  classic: { shape: "mix", colors: ["var(--lake)", "var(--lingon)", "var(--cloudberry)", "var(--pine)"] },
  lingonberry: { shape: "berry", colors: ["#c0213f", "#a3173a", "#e0435e", "#3f7d4e"] },
  snow: { shape: "flake", colors: ["#9cc9e6", "#c4e1f3", "#7cb4d8", "#e3f1fa"] },
  ruska: { shape: "leaf", colors: ["#c8432b", "#e08a1e", "#f2c14e", "#8e3b1f"] },
  stars: { shape: "star", colors: ["#f0a73a", "#f7c95c", "#ffe08a", "#e88f1d"] },
  aurora: { shape: "streak", colors: ["#3fc48a", "#5fe0a8", "#7cc0e6", "#b9a3f0"] },
};

export const FIGURES = ["none", "beanie", "glasses", "scarf", "bowtie", "crown"];

// Everything in the shop, in display order. Names live in i18n (t.shop.items).
export const SHOP_ITEMS = [
  { id: "accent-lake", kind: "accent", value: "lake", price: 0 },
  { id: "accent-fjord", kind: "accent", value: "fjord", price: 250 },
  { id: "accent-heather", kind: "accent", value: "heather", price: 250 },
  { id: "accent-aurora", kind: "accent", value: "aurora", price: 400 },
  { id: "accent-midnight", kind: "accent", value: "midnight", price: 400 },
  { id: "confetti-classic", kind: "confetti", value: "classic", price: 0 },
  { id: "confetti-lingonberry", kind: "confetti", value: "lingonberry", price: 150 },
  { id: "confetti-snow", kind: "confetti", value: "snow", price: 200 },
  { id: "confetti-ruska", kind: "confetti", value: "ruska", price: 200 },
  { id: "confetti-stars", kind: "confetti", value: "stars", price: 300 },
  { id: "confetti-aurora", kind: "confetti", value: "aurora", price: 500 },
  { id: "figure-none", kind: "figure", value: "none", price: 0 },
  { id: "figure-glasses", kind: "figure", value: "glasses", price: 100 },
  { id: "figure-scarf", kind: "figure", value: "scarf", price: 150 },
  { id: "figure-beanie", kind: "figure", value: "beanie", price: 200 },
  { id: "figure-bowtie", kind: "figure", value: "bowtie", price: 200 },
  { id: "figure-crown", kind: "figure", value: "crown", price: 750 },
];

export function shopItem(id) {
  return SHOP_ITEMS.find((item) => item.id === id) || null;
}

const FREE_ITEMS = SHOP_ITEMS.filter((item) => item.price === 0);

export function emptyShop() {
  return {
    spent: 0,
    // ids of bought items; free items are always owned and not listed.
    owned: [],
    // kind -> item id in use
    equipped: Object.fromEntries(FREE_ITEMS.map((item) => [item.kind, item.id])),
  };
}

function shopOf(state) {
  const base = emptyShop();
  const shop = state.shop || {};
  return { ...base, ...shop, equipped: { ...base.equipped, ...shop.equipped } };
}

// Points the learner can spend: everything earned minus everything spent.
export function shopBalance(state) {
  return Math.max(0, (state.xp || 0) - shopOf(state).spent);
}

export function ownsItem(state, id) {
  const item = shopItem(id);
  return Boolean(item) && (item.price === 0 || shopOf(state).owned.includes(id));
}

export function equippedItem(state, kind) {
  const id = shopOf(state).equipped[kind];
  return ownsItem(state, id) ? shopItem(id) : FREE_ITEMS.find((item) => item.kind === kind);
}

// The value in use for each kind: { accent: "lake", confetti: "classic", figure: "none" }.
export function equippedValues(state) {
  return Object.fromEntries(SHOP_KINDS.map((kind) => [kind, equippedItem(state, kind).value]));
}

// Buy an item and put it in use. Returns { state, ok, reason }; reason is
// "unknown", "owned" or "points" when nothing changed.
export function buyItem(state, id) {
  const item = shopItem(id);
  if (!item) return { state, ok: false, reason: "unknown" };
  if (ownsItem(state, id)) return { state, ok: false, reason: "owned" };
  if (shopBalance(state) < item.price) return { state, ok: false, reason: "points" };
  const shop = shopOf(state);
  return {
    state: {
      ...state,
      shop: {
        spent: shop.spent + item.price,
        owned: [...shop.owned, id],
        equipped: { ...shop.equipped, [item.kind]: id },
      },
    },
    ok: true,
  };
}

// Put an owned item in use. Unowned or unknown ids leave the state as it is.
export function equipItem(state, id) {
  const item = shopItem(id);
  if (!item || !ownsItem(state, id)) return state;
  const shop = shopOf(state);
  return { ...state, shop: { ...shop, equipped: { ...shop.equipped, [item.kind]: id } } };
}
