/**
 * The page-view script (RFC-0006 §5.1), served first-party as `/_cloudhal/p.<hash>.js` and built by
 * the `cloudhal()` integration (≤ 1 KB gzipped; a test holds it to that). Plain JavaScript because
 * it runs in the browser as built: no DOM types in this repo's Worker/Node programs.
 *
 * It stores nothing on the device, reads no cookie and sends no identifier: one beacon per page
 * view with the path, the referrer's host, the three UTM values and the navigation type. The server
 * decides everything else (the node, the channel, country, device, and whether a visitor hash may
 * be formed); Global Privacy Control and Do Not Track reach it as the `Sec-GPC` / `DNT` headers the
 * browser adds to the beacon request itself. Every step is wrapped, so the script never throws
 * into the page.
 *
 * `__CLOUDHAL_VITALS__` is replaced at build time with the hashed URL of the vitals module, loaded
 * for one page view in N (`data-v` on the script tag; `0` = never).
 */
/* global __CLOUDHAL_VITALS__ */

const ENDPOINT = "/__cloudhal/e";

/** @param {Record<string, unknown>} body */
const send = (body) => {
  const data = JSON.stringify({ schemaVersion: 1, path: location.pathname, ...body });
  try {
    if (navigator.sendBeacon(ENDPOINT, data)) return;
  } catch {}
  fetch(ENDPOINT, { method: "POST", body: data, keepalive: true, credentials: "omit" }).catch(
    () => {},
  );
};

try {
  if (!navigator.webdriver && /^https?:$/.test(location.protocol)) {
    const tag = document.querySelector(`script[src="${new URL(import.meta.url).pathname}"]`);
    const oneIn = Number(tag?.getAttribute("data-v")) | 0;
    const query = new URLSearchParams(location.search);
    /** @type {Record<string, string>} */
    const utm = {};
    for (const key of ["Source", "Medium", "Campaign"]) {
      const value = query.get(`utm_${key.toLowerCase()}`)?.slice(0, 128);
      if (value) utm[`utm${key}`] = value;
    }
    let referrer = "";
    try {
      referrer = new URL(document.referrer).hostname;
    } catch {}
    const entry = performance.getEntriesByType?.("navigation")[0];
    let navType = entry?.activationStart > 0 ? "prerender" : entry?.type || "navigate";
    let last = location.pathname;
    const view = (type, ref = referrer) => {
      last = location.pathname;
      send({ kind: "pageview", referrer: ref, ...utm, navType: type });
    };
    const start = () => {
      view(navType);
      if (oneIn > 0 && Math.random() * oneIn < 1)
        import(__CLOUDHAL_VITALS__).then((m) => m.default(send, oneIn)).catch(() => {});
    };
    // Count a page once it is first visible: a prerendered page when it is activated, a page
    // opened in a background tab when it is first shown.
    const whenVisible = () => {
      if (document.visibilityState === "visible") return start();
      const shown = () => {
        if (document.visibilityState !== "visible") return;
        removeEventListener("visibilitychange", shown);
        start();
      };
      addEventListener("visibilitychange", shown);
    };
    if (document.prerendering) {
      navType = "prerender";
      document.addEventListener("prerenderingchange", whenVisible, { once: true });
    } else whenVisible();
    // A back/forward-cache restore is a new view of the page.
    addEventListener("pageshow", (e) => {
      if (e.persisted) view("restore");
    });
    // Astro view transitions (`<ClientRouter />`): a client-side navigation to another path.
    document.addEventListener("astro:page-load", () => {
      if (location.pathname !== last) view("navigate", location.hostname);
    });
  }
} catch {}
