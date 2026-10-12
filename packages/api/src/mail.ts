/**
 * Pluggable email delivery (RFC-0005 §7.2). Cloudhal ships no sender: a deployment passes one to
 * `createApi({ mail })` (Resend, Cloudflare Email, …). With a sender, invites can be mailed
 * (`delivery: "email"`) and `/api/instance` reports `invites.delivery: ["link", "email"]`; the
 * same sender later serves password resets and notifications. Better Auth's `sendInvitationEmail`
 * is not used: it hands out the invitation id, not Cloudhal's hashed token.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailSender {
  /** Which service delivers (`"resend"`, `"cloudflare-email"`, …), for diagnostics. */
  readonly id: string;
  send(message: MailMessage): Promise<void>;
}
