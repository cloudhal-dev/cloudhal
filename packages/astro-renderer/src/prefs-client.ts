/**
 * Cloudhal's preferences script (RFC-0025 25d): the reader's choices about the site's bars, read
 * before the page paints. A tiny classic script in `<head>` (not a module: it must run before the
 * body draws), first-party under `/_cloudhal/` (CSP `script-src 'self'`), loaded only by pages
 * with a dismissible announcement or a consent bar.
 *
 * The edge cache does not vary on cookies, so the server cannot leave a closed bar out; instead this
 * marks the root (`data-ch-announcement-dismissed`, `data-ch-consent`) and the theme's CSS hides
 * the bar before it is drawn: nothing shifts. It reads cookies only and writes nothing.
 */

const code = String.raw`(function(){try{var h=document.documentElement,c=document.cookie||"";
var m=/(?:^|;\s*)ch_consent=([a-z]{1,16})/.exec(c);if(m)h.setAttribute("data-ch-consent",m[1]);
var a=h.getAttribute("data-ch-announcement");if(a){var d=/(?:^|;\s*)ch_dismiss=([^;]*)/.exec(c);
if(d&&decodeURIComponent(d[1]).split(",").indexOf(a)>=0)h.setAttribute("data-ch-announcement-dismissed","");}}catch(e){}})();
`;

export const PREFS_SCRIPT = { path: "/_cloudhal/prefs.1.js", code } as const;
