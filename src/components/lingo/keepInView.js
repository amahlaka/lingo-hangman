// Scrolls the page just enough that `el` ends above the bottom bar (.lg-tray)
// with a small gap, without pushing its top off the screen. For content that
// appears at the bottom of a screen (the last answer, the other speaker's new
// line, a result) and would otherwise sit under the sticky bar. An empty
// marker element keeps the end of a growing block in view.
export function keepInView(el, gap = 16) {
  if (!el || typeof window === "undefined" || !window.scrollBy) return;
  const tray = document.querySelector(".lg-tray");
  const view = window.innerHeight;
  const trayTop = tray ? tray.getBoundingClientRect().top : view;
  const limit = Math.min(trayTop, view) - gap;
  const box = el.getBoundingClientRect();
  const by = Math.min(box.bottom - limit, box.top - gap);
  if (by <= 0) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  window.scrollBy({ top: by, behavior: reduce ? "auto" : "smooth" });
}
