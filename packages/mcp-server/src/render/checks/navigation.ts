/**
 * In-page checks, part of `RENDER_CHECK_SCRIPT`: skip-link, landmarks, header-contrast, focus-obscured.
 * Plain source text, run inside the page; it shares the script's locals (see ./index.ts).
 */
export const NAVIGATION_CHECKS = `  // skip-link: the first focusable element is a link to the main content (or inside it).
  const shown = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
  const focusables = [...document.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])')]
    .filter((e) => !e.disabled && !e.closest("[inert],dialog:not([open]),[popover]:not(:popover-open)") && shown(e));
  const firstFocus = focusables[0];
  if (firstFocus) {
    const href = firstFocus.tagName === "A" ? firstFocus.getAttribute("href") || "" : "";
    const target = href.startsWith("#") && href.length > 1 ? document.getElementById(decodeURIComponent(href.slice(1))) : null;
    if (!target) add("skip-link", firstFocus, "the first thing Tab reaches is not a link to the main content");
    else if (!target.matches("main,[role=main]") && !target.closest("main,[role=main]")) add("skip-link", firstFocus, "it points at #" + target.id + ", outside the main content");
  }

  // landmarks: one banner header, one main, one footer (outside articles and sections), named menus.
  const top = (sel) => [...document.querySelectorAll(sel)].filter((e) => shown(e) && !(e.parentElement && e.parentElement.closest("article,aside,main,nav,section,dialog")));
  const banners = top("header"), mains = [...document.querySelectorAll("main,[role=main]")].filter(shown), infos = top("footer");
  if (banners.length !== 1) add("landmarks", banners[1] || document.body, banners.length + " page headers (one is right)");
  if (mains.length !== 1) add("landmarks", mains[1] || document.body, mains.length + " main regions (one is right)");
  if (infos.length !== 1) add("landmarks", infos[1] || document.body, infos.length + " page footers (one is right)");
  const navs = [...document.querySelectorAll("nav")].filter(shown);
  if (navs.length > 1) for (const n of navs) if (!n.getAttribute("aria-label") && !n.getAttribute("aria-labelledby")) add("landmarks", n, "a menu without a name (aria-label), among " + navs.length);

  // header-contrast: a transparent header's text against what is under it, at the top of the page.
  const clear = document.querySelector("header[data-transparent]");
  if (clear && !clear.hasAttribute("data-ch-scrolled")) {
    const done = new Set();
    const tw = document.createTreeWalker(clear, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) {
      const el = tw.currentNode.parentElement;
      if (!el || done.has(el) || !tw.currentNode.nodeValue.trim() || !visible(el)) continue;
      done.add(el);
      if (el.closest("[popover],dialog,.ch-menu__panel")) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue;
      const cx = r.left + Math.min(r.width / 2, 12), cy = r.top + Math.min(r.height / 2, 10);
      if (cy < 0 || cy >= H || cx < 0 || cx >= W) continue;
      // Text on a fill of its own inside the header (a button, a field) is the contrast check's.
      let own = false;
      for (let e = el; e && e !== clear; e = e.parentElement) if (rgba(getComputedStyle(e).backgroundColor)[3] > 0.5) { own = true; break; }
      if (own) continue;
      let bg = null;
      for (const e of document.elementsFromPoint(cx, cy)) {
        if (clear.contains(e)) continue;
        if (/^(IMG|VIDEO|CANVAS|IFRAME|PICTURE)$/.test(e.tagName)) break;
        const c = rgba(getComputedStyle(e).backgroundColor);
        if (c[3] > 0) { bg = over(c, [255, 255, 255]); break; }
      }
      if (!bg) bg = [255, 255, 255];
      const st = getComputedStyle(el);
      const got = ratio(over(rgba(st.color), bg), bg);
      const big = parseFloat(st.fontSize) >= 24 || (parseFloat(st.fontSize) >= 18.66 && Number(st.fontWeight) >= 700);
      if (got < (big ? 3 : 4.5)) add("header-contrast", el, got.toFixed(1) + ":1 over the first band, needs " + (big ? 3 : 4.5) + ":1");
    }
  }

  // focus-obscured: tabbing back up the page, a sticky or fixed header never covers the focused element.
  const stuck = [...document.querySelectorAll("header,[data-ch-bar]")].filter((e) => shown(e) && /sticky|fixed/.test(getComputedStyle(e).position));
  if (stuck.length) {
    const targets = [...document.querySelectorAll("main a[href],main button,main input,main summary,body > footer a[href]")]
      .filter((e) => shown(e) && visible(e)).slice(-40).reverse();
    window.scrollTo(0, document.documentElement.scrollHeight);
    await frame();
    for (const el of targets) {
      el.focus();
      await frame();
      const r = el.getBoundingClientRect();
      const cx = Math.min(Math.max(r.left + r.width / 2, 0), W - 1), cy = Math.min(Math.max(r.top + r.height / 2, 0), H - 1);
      const at = document.elementFromPoint(cx, cy);
      const cover = at && !el.contains(at) && stuck.find((s) => s.contains(at));
      if (cover) add("focus-obscured", el, "under the " + (cover.tagName === "HEADER" ? "sticky header" : "bar") + " when it has focus");
    }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    window.scrollTo(0, 0);
  }
`;
