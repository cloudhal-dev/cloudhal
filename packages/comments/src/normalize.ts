/**
 * Text normalising (RFC-0007 §6.4), applied by the server to everything a reader sends before the
 * content rules run and before the result is checked against the stored `Comment` contract:
 *
 * - **Text:** NFC; `\r\n` and `\r` → `\n`; control characters other than tab and line feed, C1
 *   controls and the bidirectional embedding, override and isolate characters (U+202A–U+202E,
 *   U+2066–U+2069) removed; so are the directional marks (LRM U+200E, RLM U+200F, ALM U+061C)
 *   and the zero-width characters (ZWSP U+200B, ZWNJ U+200C, ZWJ U+200D, WJ U+2060, BOM U+FEFF),
 *   except a ZWJ joining two emoji (👩‍💻 stays one emoji); trailing whitespace per line removed;
 *   more than two blank lines collapsed to two; trimmed.
 * - **Names:** NFC; the same characters removed, every ZWJ included (tabs and line breaks become
 *   spaces); internal whitespace collapsed to one space; trimmed.
 * - **Email:** trimmed and lower-cased.
 *
 * The contract refuses control and bidi characters; the server removes them rather than refusing
 * the comment, so a reader who pasted an invisible character is not stuck, and a comment cannot
 * disguise itself in Studio either way. Directional marks and zero-width characters are removed
 * too, so they cannot split a blocked word, glue look-alike names or hide in a link, but the
 * contract still allows them: imported comments (other systems, Persian text with ZWNJ, emoji
 * sequences) stay valid. Lengths count Unicode code points, as the validator does.
 */
import { EMAIL_MAX, NAME_MAX, TEXT_MAX, TEXT_MIN } from "./model.ts";

/** C0 controls except tab and LF, DEL, C1 controls, bidi embeddings/overrides/isolates. */
// Built from strings so the source never holds a literal control or bidi character.
const BIDI = "\\u202A-\\u202E\\u2066-\\u2069";
const UNSAFE_IN_TEXT = new RegExp(`[\\u0000-\\u0008\\u000B-\\u001F\\u007F-\\u009F${BIDI}]`, "gu");
const UNSAFE_IN_NAME = new RegExp(`[\\u0000-\\u001F\\u007F-\\u009F${BIDI}]`, "gu");
/** Directional marks and zero-width characters (ZWJ is handled apart in text, see below). */
const INVISIBLE = "\\u061C\\u200B\\u200C\\u200E\\u200F\\u2060\\uFEFF";
const INVISIBLE_RE = new RegExp(`[${INVISIBLE}]`, "gu");
const ZWJ_RE = /\u200D/gu;
/** A ZWJ not between two emoji (an emoji may carry VS16 or a skin tone before the joiner). */
const LONE_ZWJ_RE =
  /(?<!\p{Extended_Pictographic}|\u{FE0F}|[\u{1F3FB}-\u{1F3FF}])\u200D|\u200D(?!\p{Extended_Pictographic})/gu;

/** The contract's own refusal set (for tests and defensive checks). */
export const CONTRACT_FORBIDDEN = new RegExp(`[\\u0000-\\u0008\\u000B-\\u001F\\u007F${BIDI}]`, "u");

/** Length in Unicode code points (what JSON Schema `minLength`/`maxLength` count). */
export const codePoints = (s: string): number => {
  let n = 0;
  for (const _ of s) n++;
  return n;
};

/** Cuts to at most `max` code points without splitting a surrogate pair. */
export function cutCodePoints(s: string, max: number): string {
  if (s.length <= max) return s;
  let out = "";
  let n = 0;
  for (const ch of s) {
    if (n++ >= max) break;
    out += ch;
  }
  return out;
}

export function normalizeText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(UNSAFE_IN_TEXT, "")
    .replace(INVISIBLE_RE, "")
    .replace(LONE_ZWJ_RE, "")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+$/u, ""))
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function normalizeName(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[\t\n\r\v\f]/g, " ")
    .replace(UNSAFE_IN_NAME, "")
    .replace(INVISIBLE_RE, "")
    .replace(ZWJ_RE, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/** `undefined` for an empty value (forms send empty strings for optional fields). */
export function normalizeEmail(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const e = raw.trim().toLowerCase();
  return e.length === 0 ? undefined : e;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: the contract forbids control characters
const EMAIL_RE = /^[^\s@\x00-\x1F\x7F]{1,64}@[^\s@\x00-\x1F\x7F]{1,189}$/u;

export type FieldProblem =
  | "required"
  | "too_short"
  | "too_long"
  | "link_in_name"
  | "too_many_links"
  | "invalid";

/** Checks a normalised name (§6.4): 1–80 characters, no `://`, no `www.`. */
export function checkName(name: string): FieldProblem | undefined {
  if (name.length === 0) return "required";
  if (codePoints(name) > NAME_MAX) return "too_long";
  if (/:\/\/|www\./i.test(name)) return "link_in_name";
  if (CONTRACT_FORBIDDEN.test(name)) return "invalid";
  return undefined;
}

/** Checks a normalised text (§6.4): 2–5,000 characters. */
export function checkText(text: string): FieldProblem | undefined {
  const n = codePoints(text);
  if (n === 0) return "required";
  if (n < TEXT_MIN) return "too_short";
  if (n > TEXT_MAX) return "too_long";
  if (CONTRACT_FORBIDDEN.test(text)) return "invalid";
  return undefined;
}

/** Checks a normalised email: ≤ 254, one `@`, no whitespace or control characters. */
export function checkEmail(email: string): FieldProblem | undefined {
  if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) return "invalid";
  return undefined;
}
