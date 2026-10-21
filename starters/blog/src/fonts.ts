/**
 * The font files each pairing (RFC-0023 §2, `typePairing` in settings.ts) needs first: its latin
 * subsets, preloaded by layouts/Base.astro so headings do not swap late. The latin-ext files
 * (Turkish and other accented letters) load on demand through fonts.css's unicode ranges.
 */
export const PAIRING_PRELOADS: Readonly<Record<string, readonly string[]>> = {
  editorial: [
    "/fonts/v1/fraunces-latin-wght-normal.woff2",
    "/fonts/v1/inter-latin-wght-normal.woff2",
  ],
  modern: [
    "/fonts/v1/space-grotesk-latin-wght-normal.woff2",
    "/fonts/v1/inter-latin-wght-normal.woff2",
  ],
  humanist: ["/fonts/v1/source-sans-3-latin-wght-normal.woff2"],
  technical: [
    "/fonts/v1/jetbrains-mono-latin-wght-normal.woff2",
    "/fonts/v1/inter-latin-wght-normal.woff2",
  ],
  classic: ["/fonts/v1/source-serif-4-latin-wght-normal.woff2"],
};
