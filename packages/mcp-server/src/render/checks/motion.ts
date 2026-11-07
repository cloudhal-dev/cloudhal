/**
 * In-page checks, part of `RENDER_CHECK_SCRIPT`: The reader's scroll pass, then motion-cls, reduced-motion, motion-budget, flash; defines `frame`.
 * Plain source text, run inside the page; it shares the script's locals (see ./index.ts).
 */
export const MOTION_CHECKS = String.raw`  // RFC-0024 §8: scroll through the page once, as a reader would, so reveals play, then measure.
  let shift = 0;
  let po;
  try {
    po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) shift += e.value;
    });
    po.observe({ type: "layout-shift", buffered: true });
  } catch {}
  const pageH = document.documentElement.scrollHeight;
  for (let y = 0; y < pageH; y += Math.round(H * 0.8)) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 90));
  }
  window.scrollTo(0, pageH);
  await new Promise((r) => setTimeout(r, 700));
  if (po) {
    for (const e of po.takeRecords()) if (!e.hadRecentInput) shift += e.value;
    po.disconnect();
  }
  // motion-cls: more layout shift than Core Web Vitals' "good" threshold.
  if (shift > 0.1) add("motion-cls", document.body, "layout shift " + shift.toFixed(2) + " while loading and scrolling (good is 0.1 or less)");
  // reduced-motion: with the reader asking for less, nothing stays hidden and nothing travels.
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    for (const el of document.querySelectorAll("[data-ch-reveal]"))
      if (el.classList.contains("ch-pre") || Number(getComputedStyle(el).opacity) === 0)
        add("reduced-motion", el, "stays hidden for readers who ask for reduced motion");
    const moving = /transform|translate|scale|rotate|^top$|^left$|^right$|^bottom$|offset/;
    for (const a of document.getAnimations ? document.getAnimations() : []) {
      if (a.playState !== "running" || !a.effect || !a.effect.getKeyframes) continue;
      const props = a.effect.getKeyframes().flatMap((k) => Object.keys(k));
      if (!props.some((p) => moving.test(p))) continue;
      const el = a.effect.target;
      if (el) add("reduced-motion", el, "moves for readers who ask for reduced motion");
    }
  }
  // motion-budget: a page carries a few scroll effects and one scroll story, not a show.
  const scrolls = document.querySelectorAll("[data-ch-scroll]");
  if (scrolls.length > 6) add("motion-budget", scrolls[6], scrolls.length + " scroll effects on the page; keep to 6 or fewer, the strongest ones");
  const stories = document.querySelectorAll(".ch-scrolly");
  if (stories.length > 1) add("motion-budget", stories[1], stories.length + " scroll stories on the page; keep to one");
  const splits = document.querySelectorAll('[data-ch-reveal^="split-"]');
  if (splits.length > 2) add("motion-budget", splits[2], splits.length + " split headings or texts; keep to 2, for the lines that matter most");
  const ambients = document.querySelectorAll("[data-ch-ambient]");
  if (ambients.length > 2) add("motion-budget", ambients[2], ambients.length + " ambient backgrounds on the page; keep to 2, best one on the hero");
  const loops = document.querySelectorAll("[data-ch-loop], .ch-marquee, [data-ch-rotate]");
  if (loops.length > 2) add("motion-budget", loops[2], loops.length + " things that loop on the page; keep to 2");
  // flash: a running animation that repeats faster than three times a second and changes how
  // bright something is (opacity, color, background, filter, visibility).
  const bright = /opacity|color|background|filter|visibility|fill/i;
  for (const a of document.getAnimations ? document.getAnimations() : []) {
    if (a.playState !== "running" || !a.effect || !a.effect.getComputedTiming) continue;
    const t = a.effect.getComputedTiming();
    const each = Number(t.duration) / Math.max(0.0001, Math.abs(a.playbackRate || 1));
    if (!(t.iterations > 1) || !(each > 0) || each >= 1000 / 3) continue;
    const props = a.effect.getKeyframes ? a.effect.getKeyframes().flatMap((k) => Object.keys(k)) : [];
    if (props.some((p) => bright.test(p)) && a.effect.target) add("flash", a.effect.target, "repeats " + Math.round(1000 / each) + " times a second");
  }
  window.scrollTo(0, 0);
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await frame();
`;
