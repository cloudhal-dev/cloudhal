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

  // long-line: paragraphs averaging more than 90 characters a line.
  for (const p of document.querySelectorAll("p,li,dd,blockquote")) {
    if (!visible(p) || p.querySelector("p,li")) continue;
    const text = (p.innerText || "").trim();
    if (text.length < 180) continue;
    const s = getComputedStyle(p);
    const lh = s.lineHeight === "normal" ? parseFloat(s.fontSize) * 1.2 : parseFloat(s.lineHeight);
    const lines = Math.round(p.getBoundingClientRect().height / lh);
    if (lines < 3) continue;
    const per = Math.round(text.length / lines);
    if (per > 90) add("long-line", p, "about " + per + " characters a line");
  }
`;
