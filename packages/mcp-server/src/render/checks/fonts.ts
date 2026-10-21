/**
 * In-page checks, part of `RENDER_CHECK_SCRIPT`: font-fallback.
 * Plain source text, run inside the page; it shares the script's locals (see ./index.ts).
 */
export const FONT_CHECKS = `  // font-fallback (RFC-0023 §2): text set in a web font whose stack has no metric-matched fallback
  // right after it (a face with size-adjust or ascent-override). Without one, the text is first
  // drawn in a system font of another size and moves when the web font arrives.
  if (document.fonts) {
    const tuned = new Set(), web = new Set();
    const name = (f) => f.trim().replace(/^["']|["']$/g, "").toLowerCase();
    for (const f of document.fonts) {
      const fam = name(f.family);
      if ((f.sizeAdjust && f.sizeAdjust !== "100%") || (f.ascentOverride && f.ascentOverride !== "normal")) tuned.add(fam);
      else if (f.status === "loaded") web.add(fam);
    }
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || !n.textContent.trim()) continue;
      const stack = getComputedStyle(el).fontFamily;
      if (seen.has(stack)) continue;
      seen.add(stack);
      const fams = stack.split(",").map(name);
      if (!web.has(fams[0]) || tuned.has(fams[0]) || tuned.has(fams[1] || "")) continue;
      if (!visible(el)) { seen.delete(stack); continue; }
      add("font-fallback", el, JSON.stringify(fams[0]) + " has no metric-matched fallback after it, so the text moves when the font loads");
    }
  }
`;
