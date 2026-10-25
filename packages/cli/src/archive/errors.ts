/**
 * The one error type of the site archive container (RFC-0039): a code that `cloudhal import` maps
 * to its messages, the archive path when there is one, and a safe echo of untrusted names.
 */

/**
 * - `not_archive`: empty, not gzip, or no Cloudhal manifest as the first entry.
 * - `unsupported_version`: written by a newer Cloudhal (archive, contracts or bundle format).
 * - `invalid_manifest`: `manifest.json` is malformed or disagrees with itself.
 * - `unsafe_entry`: a tar header or path Cloudhal never writes (links, devices, traversal).
 * - `mismatch`: the entries disagree with the manifest (unlisted, duplicate, order, size, missing).
 * - `damaged`: a checksum, SHA-256 or zlib check failed, or data follows the tar or gzip end.
 * - `truncated`, `too_large`: the input ends early, or is over a cap.
 * - `invalid_input`: the writer was given content it must not write, or a body was misused.
 */
export type ArchiveErrorCode =
  | "not_archive"
  | "unsupported_version"
  | "invalid_manifest"
  | "unsafe_entry"
  | "mismatch"
  | "damaged"
  | "truncated"
  | "too_large"
  | "invalid_input";

/** Every failure of the archive writer and reader. */
export class ArchiveError extends Error {
  override readonly name = "ArchiveError";
  readonly code: ArchiveErrorCode;
  /** The archive path the error is about, when there is one (a path of the closed layout). */
  readonly path: string | undefined;
  constructor(
    code: ArchiveErrorCode,
    message: string,
    options: { path?: string; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.path = options.path;
  }
}

const MAX_ECHO = 120;

/**
 * An untrusted name (an entry name by default) as it may appear in a message: JSON-quoted and cut
 * when every character is printable ASCII, otherwise only `described`, so a name cannot carry
 * terminal escapes (C0 or C1 controls), bidi overrides or megabytes into a message.
 */
export function printable(
  raw: string,
  described = "an entry name with a non-printable byte",
): string {
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c < 0x21 || c > 0x7e) return described;
  }
  return JSON.stringify(raw.length > MAX_ECHO ? `${raw.slice(0, MAX_ECHO)}...` : raw);
}
