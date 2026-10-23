/**
 * In-page checks, part of `RENDER_CHECK_SCRIPT`: surface-broken, script-blocked.
 * Plain source text, run inside the page; it shares the script's locals (see ./index.ts).
 */

/**
 * Runs in the page before any of its own scripts (`Page.addScriptToEvaluateOnNewDocument`):
 * keeps the Content-Security-Policy violations the page raises while it loads, which the
 * `script-blocked` check reads. Report-only ones (`cloudhal dev`) are kept too.
 */
export const CSP_LISTENER = `(() => {
  const seen = (window.__chCsp = []);
  window.addEventListener("securitypolicyviolation", (e) => {
    if (seen.length < 50)
      seen.push({ directive: e.effectiveDirective || e.violatedDirective || "", blocked: e.blockedURI || "", sample: e.sample || "", line: e.lineNumber || 0, report: e.disposition === "report", el: e.target instanceof Element ? e.target : null });
  }, true);
})();`;

export const SCRIPT_CHECKS = `  // surface-broken: a body surface the preview could not draw (RFC-0020 §5), or a component in one
  // with an unknown block type or props that do not fit it. Theme blocks the preview leaves to the
  // site are fine.
  for (const el of document.querySelectorAll(".ch-surface-problem")) {
    const why = [...el.querySelectorAll("li")].map((li) => (li.textContent || "").trim()).filter(Boolean);
    add("surface-broken", el, why.length ? why.slice(0, 3).join("; ") : "this interactive block cannot be shown");
  }
  for (const el of document.querySelectorAll(".ch-block--missing")) {
    const text = (el.textContent || "").trim();
    if (!/shown by the theme on the site$/.test(text)) add("surface-broken", el, text);
  }

  // script-blocked: scripts the page's Content-Security-Policy refused (the Site Worker sends
  // script-src 'self', so an inline <script> never runs there). A static preview runs none on
  // purpose (its own CSP), so it is not asked.
  const runsScripts = !document.querySelector('meta[name="generator"][content="Cloudhal preview"]');
  for (const v of runsScripts ? window.__chCsp || [] : []) {
    if (!/^(script-src|script-src-elem|script-src-attr|worker-src)$/.test(v.directive)) continue;
    const inline = v.blocked === "inline" || v.blocked === "eval" || !v.blocked;
    const what = inline
      ? (v.blocked === "eval" ? "eval" : "an inline script") + (v.sample ? " " + JSON.stringify(clip(v.sample.trim(), 40)) : "") + (v.line ? " at line " + v.line : "")
      : "the script " + v.blocked;
    const fix = inline ? "; ship it as a file (a .js under /_astro or public/)" : "";
    const el = v.el && v.el.isConnected ? v.el : document.body;
    add("script-blocked", el, what + (v.report ? " would be blocked on the site" : " was blocked") + " by " + v.directive + fix);
  }
`;
