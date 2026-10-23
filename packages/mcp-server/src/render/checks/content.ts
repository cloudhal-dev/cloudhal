/**
 * In-page checks, part of `RENDER_CHECK_SCRIPT`: empty-section, tap-target, input-label, chart-empty, long-line.
 * Plain source text, run inside the page; it shares the script's locals (see ./index.ts).
 */
export const CONTENT_CHECKS = `  // empty-section
  for (const s of document.querySelectorAll("[data-section-id]")) {
    if (getComputedStyle(s).display === "none") continue;
    const text = (s.innerText || "").trim();
    const media = s.querySelector("img,video,iframe,svg,canvas,input,select,textarea,picture");
    const r = s.getBoundingClientRect();
    if (!text && !media) add("empty-section", s, "no text or media");
    else if (r.height < 8) add("empty-section", s, Math.round(r.height) + " px tall");
  }

  // tap-target: on small screens, controls under 24 × 24 px that sit too close to another one
  // (WCAG 2.5.8: a 24 px circle on each must not touch another target; links inside sentences are exempt).
  if (W < 768) {
    const targets = [...document.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button]")]
      .filter(visible)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      // screen-reader-only controls (1 × 1 px) are not tapped
      .filter((t) => t.r.width > 2 || t.r.height > 2);
    const small = (t) => t.r.width < 24 || t.r.height < 24;
    const centre = (r) => [r.left + r.width / 2, r.top + r.height / 2];
    const toRect = (p, r) => Math.hypot(Math.max(r.left - p[0], 0, p[0] - r.right), Math.max(r.top - p[1], 0, p[1] - r.bottom));
    for (const t of targets) {
      if (!small(t)) continue;
      if (t.el.tagName === "A" && getComputedStyle(t.el).display === "inline") {
        const block = t.el.closest("p,li,td,dd,blockquote,figcaption");
        if (block && (block.innerText || "").trim().length > (t.el.innerText || "").trim().length + 20) continue;
      }
      const c = centre(t.r);
      const near = targets.find((o) => o !== t && !o.el.contains(t.el) && !t.el.contains(o.el) &&
        (toRect(c, o.r) < 12 || (small(o) && Math.hypot(c[0] - centre(o.r)[0], c[1] - centre(o.r)[1]) < 24)));
      if (near) add("tap-target", t.el, Math.round(t.r.width) + " × " + Math.round(t.r.height) + " px, too close to " + JSON.stringify(clip((near.el.innerText || near.el.getAttribute("aria-label") || near.el.tagName.toLowerCase()).trim(), 24)));
    }
  }

  // input-label: form controls without an accessible name (a label, aria-label or aria-labelledby).
  for (const el of document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]),select,textarea")) {
    if (!visible(el) && !(el.type === "radio" || el.type === "checkbox")) continue;
    const named = [...(el.labels || [])].some((l) => (l.innerText || l.textContent || "").trim()) ||
      (el.getAttribute("aria-label") || "").trim() ||
      (el.getAttribute("aria-labelledby") || "").split(/s+/).some((id) => id && (document.getElementById(id)?.textContent || "").trim());
    if (!named) add("input-label", el, "no label a screen reader can announce");
  }

  // chart-empty: a chart whose data has no rows.
  for (const el of document.querySelectorAll("[data-ch-chart-empty]")) add("chart-empty", el, "no rows in its data");

  // long-line: text columns whose full lines hold more than 90 characters on average. Counted on
  // the rendered lines (each paragraph's last, partly filled one left out) and pooled over every
  // paragraph of the same width and font, so paragraphs of one column get one verdict.
  const range = document.createRange();
  const columns = new Map();
  let measured = 0;
  for (const p of document.querySelectorAll("p,li,dd,blockquote")) {
    if (measured >= 80 || !visible(p) || p.querySelector("p,li")) continue;
    if ((p.innerText || "").trim().length < 180) continue;
    measured++;
    // Characters by the line they are drawn on, in reading order: a character more than half a
    // line below the current line starts the next (inline code in another size stays on its line).
    // A run of spaces counts once, as it is shown.
    const s = getComputedStyle(p);
    const half = (s.lineHeight === "normal" ? parseFloat(s.fontSize) * 1.2 : parseFloat(s.lineHeight)) / 2;
    const rows = [];
    let top = -Infinity, seen = 0, space = true;
    const tw = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    while (tw.nextNode() && seen < 800) {
      const n = tw.currentNode;
      for (let i = 0; i < n.length && seen < 800; i++) {
        const blank = /\s/.test(n.data[i]);
        if (blank && space) continue;
        space = blank;
        seen++;
        range.setStart(n, i);
        range.setEnd(n, i + 1);
        const b = range.getClientRects()[0];
        if (!b) continue;
        if (b.top > top + half) { rows.push(0); top = b.top; }
        rows[rows.length - 1]++;
      }
    }
    // The last line seen may be partly filled (the paragraph's end, or where counting stopped).
    const full = rows.slice(0, -1);
    if (full.length < 2) continue;
    const width = Math.round(p.getBoundingClientRect().width);
    const key = width + "|" + s.fontSize + "|" + s.fontFamily;
    const col = columns.get(key) || { width, first: p, paragraphs: 0, lines: 0, chars: 0 };
    col.paragraphs++;
    col.lines += full.length;
    col.chars += full.reduce((a, b) => a + b, 0);
    columns.set(key, col);
  }
  for (const col of columns.values()) {
    const per = Math.round(col.chars / col.lines);
    if (per > 90)
      add("long-line", col.first, "about " + per + " characters a line in this " + col.width + " px column" + (col.paragraphs > 1 ? " (" + col.paragraphs + " paragraphs)" : ""));
  }
`;
