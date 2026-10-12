/**
 * The vitals module (RFC-0006 §5.1), served as `/_cloudhal/v.<hash>.js` and imported by the
 * page-view script for one page view in N. Google's `web-vitals` (Apache-2.0) measures LCP, INP,
 * CLS, TTFB and FCP; one `vitals` beacon goes out when the page is first hidden (Cloudflare Web
 * Analytics' moment). Values are clamped to the beacon contract; the server rounds them and checks
 * `sampleOneIn` against the site's setting.
 */
import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";

/**
 * @param {(body: Record<string, unknown>) => void} send the page-view script's sender
 * @param {number} oneIn the sampling this page view was chosen under
 */
export default function vitals(send, oneIn) {
  try {
    /** @type {Record<string, number>} */
    const metrics = {};
    const keep = (key, max) => (m) => {
      if (Number.isFinite(m.value)) metrics[key] = Math.min(max, Math.max(0, m.value));
    };
    const all = { reportAllChanges: true };
    onLCP(keep("lcp", 600_000), all);
    onINP(keep("inp", 600_000), all);
    onCLS(keep("cls", 100), all);
    onTTFB(keep("ttfb", 600_000), all);
    onFCP(keep("fcp", 600_000), all);
    let sent = false;
    addEventListener("visibilitychange", () => {
      if (sent || document.visibilityState !== "hidden" || Object.keys(metrics).length === 0)
        return;
      sent = true;
      send({ kind: "vitals", ...metrics, sampleOneIn: oneIn });
    });
  } catch {}
}
