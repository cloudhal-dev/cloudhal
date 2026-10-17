/**
 * In-page checks, part of `RENDER_CHECK_SCRIPT`: overflow-x, img-alt / img-broken, heading-order.
 * Plain source text, run inside the page; it shares the script's locals (see ./index.ts).
 */
export const LAYOUT_CHECKS = `  // overflow-x: the outermost elements that stick out past the screen's right edge.
  const sw = document.documentElement.scrollWidth;
  if (sw > W + 1) {
    const clipped = (el) => {
      for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
        const o = getComputedStyle(e).overflowX;
        if (o !== "visible") return true;
      }
      return false;
    };
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= W + 1) continue;
      const p = el.parentElement && el.parentElement.getBoundingClientRect();
      if (p && p.right > W + 1) continue;
      if (clipped(el)) continue;
      add("overflow-x", el, Math.round(r.right - W) + " px past the edge");
    }
    if (out["overflow-x"].count === 0) add("overflow-x", document.body, "the page is " + (sw - W) + " px wider than the screen");
  }

  // img-alt / img-broken
  for (const img of imgs) {
    if (!img.hasAttribute("alt") && img.getAttribute("role") !== "presentation" && img.getAttribute("aria-hidden") !== "true")
      add("img-alt", img, "no alt attribute");
    if (img.getAttribute("src") && img.complete && img.naturalWidth === 0) add("img-broken", img, "did not load");
  }

  // heading-order
  const hs = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible);
  const h1 = hs.filter((h) => h.tagName === "H1");
  if (h1.length === 0) add("heading-order", document.body, "no level-1 heading");
  for (const h of h1.slice(1)) add("heading-order", h, "a second level-1 heading");
  let prev = 0;
  for (const h of hs) {
    const level = Number(h.tagName[1]);
    if (prev && level > prev + 1) add("heading-order", h, "h" + prev + " → h" + level + " skips a level");
    prev = level;
  }
`;
