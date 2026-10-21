/**
 * The signed-in session, kept between navigations. Every protected route checks it in
 * `beforeLoad`, and asking the server each time cost 240–640 ms before a screen could start
 * (the URL changed, the screen did not). A session that was there a moment ago still is: it is
 * reused for `MAX_AGE_MS`, and forgotten on sign-out, on revoking sessions and on any 401 from
 * the API, so the next navigation asks again and an expired session still lands on the login.
 */
const MAX_AGE_MS = 5 * 60_000;

let kept: { at: number; session: Promise<unknown> } | undefined;

/**
 * The session from `load`, or the one kept from a recent call. Concurrent callers share one
 * request; a failed or empty answer is never kept.
 */
export function cachedSession<T>(
  load: () => Promise<T | null>,
  now = Date.now(),
): Promise<T | null> {
  if (kept && now - kept.at < MAX_AGE_MS) return kept.session as Promise<T | null>;
  const session = load().then(
    (value) => {
      if (value == null && kept?.session === session) kept = undefined;
      return value;
    },
    (error: unknown) => {
      if (kept?.session === session) kept = undefined;
      throw error;
    },
  );
  kept = { at: now, session };
  return session;
}

/** Ask the server again on the next navigation (sign-out, revoked sessions, a 401). */
export function forgetSession(): void {
  kept = undefined;
}
