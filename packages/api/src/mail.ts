/**
 * Pluggable email delivery (RFC-0005 §7.2, RFC-0011). A deployment passes a sender to
 * `createApi({ mail })`: `@cloudhal/cloudflare`'s `cloudflareEmailSender` on Workers (the
 * `send_email` binding), the CLI's terminal sender offline. With a sender, invites can be mailed
 * (`delivery: "email"`), members can ask for a reset link by email, and `/api/instance` reports
 * `invites.delivery: ["link", "email"]` and `passwordReset: ["admin", "email"]`. Better Auth's
 * `sendInvitationEmail` and `sendResetPassword` are not used: Cloudhal's hashed, audited tokens are.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailSender {
  /** Which service delivers (`"cloudflare-email"`, `"terminal"`, …), for diagnostics. */
  readonly id: string;
  send(message: MailMessage): Promise<void>;
}

/** Service codes that may succeed later (limits, outages); the rest need a configuration fix. */
const RETRYABLE = new Set([
  "E_RATE_LIMIT_EXCEEDED",
  "E_DAILY_LIMIT_EXCEEDED",
  "E_INTERNAL_SERVER_ERROR",
]);

/** A failed send, with the service's code (`E_SENDER_NOT_VERIFIED`, …) or `E_UNKNOWN`. */
export class MailError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MailError";
    this.code = /^E_[A-Z_]{1,64}$/.test(code) ? code : "E_UNKNOWN";
    this.retryable = RETRYABLE.has(this.code);
  }

  /** Any thrown value as a `MailError` (a binding throws `Error`s with a `code` property). */
  static from(e: unknown): MailError {
    if (e instanceof MailError) return e;
    const code = (e as { code?: unknown } | null)?.code;
    return new MailError(
      typeof code === "string" ? code : "E_UNKNOWN",
      e instanceof Error ? e.message : String(e),
    );
  }
}
