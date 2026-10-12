/** Control characters and bidi overrides the contracts refuse in one-line text (messages, errors). */
const UNSAFE_LINE = /[\p{Cc}‪-‮⁦-⁩]/gu;
/** The same, except tab and line feed, which a run summary may hold (`ScheduleRun.summary`). */
const UNSAFE_TEXT = /[^\P{Cc}\t\n]|[‪-‮⁦-⁩]/gu;
const COUNT_KEY = /^[a-z][a-z0-9-]{0,40}$/;

/** One line of plain text the contracts accept: unsafe characters become spaces, at most `max` long. */
export function plainLine(text: string, max = 500): string {
  return text.replace(UNSAFE_LINE, " ").slice(0, max);
}

/** Plain text for a run summary (tabs and new lines kept), at most `max` long. */
export function plainText(text: string, max = 2_000): string {
  return text.replace(UNSAFE_TEXT, " ").slice(0, max);
}

/** Findings counts as the contract takes them: lower-case keys, whole non-negative numbers, at most 20. */
export function cleanCounts(counts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) {
    if (Object.keys(out).length >= 20) break;
    if (COUNT_KEY.test(k) && Number.isFinite(v)) out[k] = Math.max(0, Math.floor(v));
  }
  return out;
}
