/**
 * In-page checks, part of `RENDER_CHECK_SCRIPT`: Shared helpers (W, H, ids, out, describe, add, visible), lazy images, fonts, finished entrances.
 * Plain source text, run inside the page; it shares the script's locals (see ./index.ts).
 */
import { RENDER_CHECK_IDS } from "../types.ts";

export const PRELUDE = String.raw`  const W = document.documentElement.clientWidth || window.innerWidth, H = window.innerHeight, MAX = 5;
  const ids = ${JSON.stringify(RENDER_CHECK_IDS)};
  const out = Object.fromEntries(ids.map((id) => [id, { id, count: 0, examples: [] }]));
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  const describe = (el) => {
    if (el === document.body || el === document.documentElement) return "the page";
    const parts = [];
    const sec = el.closest && el.closest("[data-section-id]");
    const comp = el.closest && el.closest("[data-component-id]");
    if (sec) parts.push("section " + sec.getAttribute("data-section-id"));
    else {
      const mark = el.closest && el.closest("header,footer,nav,aside");
      if (mark) parts.push("theme " + mark.tagName.toLowerCase() + " (not a section)");
    }
    if (comp) parts.push("component " + comp.getAttribute("data-component-id"));
    let tag = el.tagName.toLowerCase();
    if (el.id) tag += "#" + el.id;
    else if (typeof el.className === "string" && el.className.trim())
      tag += "." + el.className.trim().split(/\s+/).slice(0, 2).join(".");
    parts.push(tag);
    const text = ((el.innerText || "").trim() || el.getAttribute("alt") || el.getAttribute("src") || "").replace(/\s+/g, " ");
    if (text) parts.push(JSON.stringify(clip(text, 48)));
    return parts.join(" ");
  };
  const add = (id, el, note) => {
    const c = out[id];
    c.count++;
    if (c.examples.length < MAX) c.examples.push(describe(el) + (note ? " — " + note : ""));
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = getComputedStyle(el);
    // RFC-0024: content waiting for its reveal (.ch-pre) is content, whatever its opacity now.
    const waiting = el.closest && el.closest(".ch-pre");
    return s.visibility !== "hidden" && s.display !== "none" && (Number(s.opacity) > 0 || !!waiting);
  };

  // Lazy images load first, so broken ones show and the screenshots are complete.
  const imgs = [...document.images];
  // (which ones the page asked to be lazy is kept for carousel-lcp)
  const wasLazy = new Set(imgs.filter((i) => i.loading === "lazy"));
  for (const img of imgs) if (img.loading === "lazy") img.loading = "eager";
  await Promise.race([
    Promise.all(imgs.map((i) => i.complete ? null : new Promise((r) => {
      i.addEventListener("load", r, { once: true });
      i.addEventListener("error", r, { once: true });
    }))),
    new Promise((r) => setTimeout(r, 4000)),
  ]);
  if (document.fonts) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2000))]);
  // RFC-0024: entrances that play on load finish first, so checks see the page's final state.
  if (document.getAnimations)
    await Promise.race([
      Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
`;
