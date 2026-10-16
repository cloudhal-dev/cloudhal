/**
 * The font files each pairing (RFC-0023 §2, `typePairing` in settings.ts) needs first: its latin
 * subsets, preloaded by layouts/Base.astro so headings do not swap late. The latin-ext files
 * (Turkish and other accented letters) load on demand through fonts.css's unicode ranges.
 */
export const PAIRING_PRELOADS: Readonly<Record<string, readonly string[]>> = {
  editorial: ["/fonts/fraunces-latin-wght-normal.woff2", "/fonts/inter-latin-wght-normal.woff2"],
  modern: ["/fonts/space-grotesk-latin-wght-normal.woff2", "/fonts/inter-latin-wght-normal.woff2"],
  humanist: ["/fonts/source-sans-3-latin-wght-normal.woff2"],
  technical: [
    "/fonts/jetbrains-mono-latin-wght-normal.woff2",
    "/fonts/inter-latin-wght-normal.woff2",
  ],
  classic: ["/fonts/source-serif-4-latin-wght-normal.woff2"],
};
