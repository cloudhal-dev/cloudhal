/**
 * In-page checks, part of `RENDER_CHECK_SCRIPT`: carousel-label / -lcp / -focus / -autoplay, image-fit, overlay-open; ends at the top of the page.
 * Plain source text, run inside the page; it shares the script's locals (see ./index.ts).
 */
export const COMPONENT_CHECKS = `  // A static preview runs no scripts (its CSP), so checks of what a module does wait for the site.
  const staticPreview = !!document.querySelector('meta[name="generator"][content="Cloudhal preview"]');
  // carousel-label and carousel-lcp: named carousels and slides; a hero's first slide not lazy.
  for (const c of document.querySelectorAll('[aria-roledescription="carousel"], [aria-roledescription="kaydırmalı alan"]')) {
    const name = (c.getAttribute("aria-label") || "").trim();
    if (!name) add("carousel-label", c, "a carousel without a name (aria-label)");
    else if (/carousel|karusel/i.test(name)) add("carousel-label", c, "its name says carousel; name what it shows");
    const slides = [...c.querySelectorAll('[aria-roledescription="slide"], [aria-roledescription="slayt"]')];
    for (const s of slides) if (!(s.getAttribute("aria-label") || "").trim()) add("carousel-label", s, "a slide without a name");
    if (!staticPreview && c.querySelector('[data-ch-carousel="prev"][data-ch-pending],[data-ch-carousel="next"][data-ch-pending]'))
      add("carousel-focus", c, "its arrows never appeared: the carousel module did not run");
    if (!staticPreview && c.getAttribute("data-variant") === "hero")
      for (const s of slides.slice(1)) {
        if (s.closest("[inert]")) continue;
        const f = s.querySelector('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
        if (f) add("carousel-focus", f, "Tab can land in a slide out of view (make off-screen slides inert)");
      }
    if (c.hasAttribute("data-autoplay")) {
      const first = c.querySelector('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (!first || first.getAttribute("data-ch-carousel") !== "rotate")
        add("carousel-autoplay", c, "it plays on its own without a rotation control first in Tab order");
      else if (!(first.getAttribute("aria-label") || "").trim())
        add("carousel-autoplay", first, "its rotation control has no name");
    }
    if (c.getAttribute("data-variant") === "hero")
      slides.forEach((s, i) => {
        for (const img of s.querySelectorAll("img")) {
          const lazy = wasLazy.has(img);
          if (i === 0 && lazy) add("carousel-lcp", img, "the first hero slide's image is lazy; it is what the reader sees first");
          if (i > 0 && !lazy) add("carousel-lcp", img, "slide " + (i + 1) + "'s image loads before anyone sees it; make it lazy");
        }
      });
  }

  // image-fit: cover crops that cut away much of a picture without a focal point (object-position).
  for (const img of document.querySelectorAll("[data-section-id] img")) {
    const box = img.getBoundingClientRect();
    if (!img.naturalWidth || !img.naturalHeight || box.width < 80 || box.height < 80) continue;
    const cs = getComputedStyle(img);
    if (cs.objectFit !== "cover" || /object-position/.test(img.getAttribute("style") || "")) continue;
    const own = img.naturalWidth / img.naturalHeight;
    const frame = box.width / box.height;
    const kept = Math.min(own, frame) / Math.max(own, frame);
    if (kept < 0.6)
      add("image-fit", img, "the frame keeps " + Math.round(kept * 100) + "% of the picture with no focal point; set one (update_asset focal) or use fit blur-fill");
  }

  const playing = document.querySelectorAll("[data-autoplay]");
  if (playing.length > 1) add("carousel-autoplay", playing[1], "a second carousel plays on its own; one per page at most");

  // overlay-open: every overlay of the page's sections, opened the way a reader would.
  const isOpen = (t) => !!t.open || t.matches(":popover-open");
  const overlaysOf = [...document.querySelectorAll("[data-section-id] dialog.ch-dialog, [data-section-id] [popover].ch-popover")];
  for (const t of overlaysOf) {
    const sel = '[commandfor="' + t.id + '"]:not([command="close"]),[popovertarget="' + t.id + '"]:not([popovertargetaction="hide"]),[data-ch-open="' + t.id + '"],[data-ch-lightbox="' + t.id + '"]';
    const trigger = [...document.querySelectorAll(sel)].find(shown);
    if (!trigger) { add("overlay-open", t, "nothing on the page opens it"); continue; }
    trigger.scrollIntoView({ block: "center" });
    trigger.focus();
    trigger.click();
    await frame();
    if (!isOpen(t)) { add("overlay-open", trigger, "did not open its overlay"); continue; }
    const modal = t.tagName === "DIALOG";
    if (modal && !t.contains(document.activeElement)) add("overlay-open", t, "focus stayed outside when it opened");
    if (modal && t.getAttribute("closedby") === "none" && !t.querySelector('[command="close"]'))
      add("overlay-open", t, "it closes only by a button, and has none");
    // Its text against its own paint (an overlay is opaque).
    const tw = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
    const doneT = new Set();
    while (tw.nextNode()) {
      const el = tw.currentNode.parentElement;
      if (!el || doneT.has(el) || !tw.currentNode.nodeValue.trim() || !visible(el)) continue;
      doneT.add(el);
      // The first opaque fill between the text and the overlay's edge.
      let bg = null;
      for (let e = el; e && !bg; e = e === t ? null : e.parentElement) {
        const c = rgba(getComputedStyle(e).backgroundColor);
        if (c[3] >= 1) bg = c.slice(0, 3);
      }
      if (!bg) continue;
      const st = getComputedStyle(el);
      const got = ratio(over(rgba(st.color), bg), bg);
      const big = parseFloat(st.fontSize) >= 24 || (parseFloat(st.fontSize) >= 18.66 && Number(st.fontWeight) >= 700);
      if (got < (big ? 3 : 4.5)) add("overlay-open", el, got.toFixed(1) + ":1 inside the overlay, needs " + (big ? 3 : 4.5) + ":1");
    }
    if (modal) t.close(); else t.hidePopover();
    await frame();
    if (document.activeElement !== trigger) add("overlay-open", trigger, "focus did not come back when it closed");
  }
  window.scrollTo(0, 0);
`;
