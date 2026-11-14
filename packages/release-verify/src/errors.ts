/**
 * The refusals of RFC-0046 §11a. Each `code` is public API: consumers branch on it, so a code is
 * never renamed or reused. There is no warning level: every one of them refuses the release.
 */
export const ERROR_CODES = [
  "statement-too-large",
  "signature-size",
  "key-unknown",
  "key-revoked",
  "signature-invalid",
  "wrong-version",
  "wrong-channel",
  "statement-invalid",
  "manifest-mismatch",
  "manifest-invalid",
  "statement-manifest-mismatch",
  "plan-version-unsupported",
  "tarball-mismatch",
  "tar-format",
  "entry-path",
  "entry-unlisted",
  "entry-mismatch",
  "entry-missing",
  "limit-exceeded",
] as const;

export type ReleaseVerifyErrorCode = (typeof ERROR_CODES)[number];

export class ReleaseVerifyError extends Error {
  override readonly name = "ReleaseVerifyError";
  readonly code: ReleaseVerifyErrorCode;
  constructor(code: ReleaseVerifyErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** Throws the refusal `code`; typed `never` so checks read as guards. */
export function refuse(code: ReleaseVerifyErrorCode, message: string): never {
  throw new ReleaseVerifyError(code, message);
}
