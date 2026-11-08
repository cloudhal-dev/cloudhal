/**
 * The address check of the invite and password-reset routes (#174). It accepts exactly what
 * `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` accepted, in one linear pass, and checks the length first. That
 * regex backtracked quadratically on `a@` followed by many dots (the domain part is ambiguous on
 * "."), and it ran before the length cap on the unauthenticated `POST /api/password-reset/request`.
 */

/** RFC 5321's limit on a forward path: longer is never an address. */
export const EMAIL_MAX_LENGTH = 254;

/**
 * One `@` with something before it; after it, no `@` and a `.` with something on both sides; no
 * whitespace anywhere; at most `EMAIL_MAX_LENGTH` characters.
 */
export function isEmailAddress(value: string): boolean {
  if (value.length > EMAIL_MAX_LENGTH || /\s/.test(value)) return false;
  const at = value.indexOf("@");
  if (at < 1 || value.indexOf("@", at + 1) !== -1) return false;
  // `[^\s@]+\.[^\s@]+`: a dot that is neither the domain's first nor its last character.
  return value.slice(at + 2, -1).includes(".");
}
