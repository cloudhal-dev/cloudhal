/**
 * In-page checks, part of `RENDER_CHECK_SCRIPT`: contrast: text against what is painted beneath it, band by band.
 * Plain source text, run inside the page; it shares the script's locals (see ./index.ts).
 */
export const CONTRAST_CHECKS = `  // contrast: text against what is painted beneath it (elementsFromPoint), band by band.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  const rgba = (css) => {
    g.clearRect(0, 0, 1, 1);
    g.fillStyle = "rgba(0,0,0,0)";
    g.fillStyle = css;
    g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
  const lum = (c) => {
    const [r, gg, b] = c.map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * gg + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode() && texts.length < 800) {
    const n = walker.currentNode;
    const el = n.parentElement;
    if (!el || seen.has(el) || !n.nodeValue.trim()) continue;
    if (el.closest("script,style,noscript,template,svg")) continue;
    seen.add(el);
    if (visible(el)) texts.push(el);
  }
  const pending = new Set(texts);
  const page = Math.max(document.documentElement.scrollHeight, H);
  for (let y = 0; y < page && pending.size; y += H) {
    window.scrollTo(0, y);
    for (const el of [...pending]) {
      const r = el.getBoundingClientRect();
      const cx = r.left + Math.min(r.width / 2, 12), cy = r.top + Math.min(r.height / 2, 10);
      if (cy < 0 || cy >= H || cx < 0 || cx >= W) continue;
      const stack = document.elementsFromPoint(cx, cy);
      const at = stack.indexOf(el);
      if (at < 0) continue;
      pending.delete(el);
      const layers = [];
      let known = true;
      for (const e of stack.slice(at)) {
        const s = getComputedStyle(e);
        if (/^(IMG|VIDEO|CANVAS|IFRAME|PICTURE)$/.test(e.tagName) || e.tagName.toLowerCase() === "svg" || s.backgroundImage !== "none") { known = false; break; }
        const c = rgba(s.backgroundColor);
        if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
      }
      if (!known) continue;
      let bg = [255, 255, 255];
      for (const c of layers.reverse()) bg = over(c, bg);
      const s = getComputedStyle(el);
      const fg = over(rgba(s.color), bg);
      const size = parseFloat(s.fontSize), weight = Number(s.fontWeight) || 400;
      const need = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
      const got = ratio(fg, bg);
      if (got < need) add("contrast", el, got.toFixed(1) + ":1, needs " + need + ":1");
    }
  }
  window.scrollTo(0, 0);
`;
