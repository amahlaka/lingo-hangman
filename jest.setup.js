import '@testing-library/jest-dom';

// Mock window.matchMedia for tests (jsdom does not implement it)
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = function matchMedia(query) {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: function () {}, // deprecated
      removeListener: function () {}, // deprecated
      addEventListener: function () {},
      removeEventListener: function () {},
      dispatchEvent: function () { return false; }
    };
  };
}

// jsdom has window.scrollBy but only logs "Not implemented" (keepInView uses it)
if (typeof window !== 'undefined') {
  window.scrollBy = function scrollBy() {};
}

// Unfinished rounds (src/lib/resume.js) would otherwise be offered to the next
// test that opens the same game.
beforeEach(() => {
  try {
    window.localStorage.removeItem('lingo.resume.v1');
  } catch {
    // no storage in this environment
  }
});
