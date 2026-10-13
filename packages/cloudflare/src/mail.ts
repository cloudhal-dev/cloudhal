/**
 * Email delivery through the Cloudflare Email Service `send_email` binding (RFC-0011, ADR-0025).
 * `cloudhal deploy` binds it as `EMAIL`, locked to one sender (`allowed_sender_addresses`), and sets
 * `CLOUDHAL_MAIL_FROM` / `CLOUDHAL_MAIL_FROM_NAME`. Plain text only; bodies are never logged (they
 * carry one-time links).
 */
import { MailError, type MailMessage, type MailSender } from "@cloudhal/api";

/** The part of the binding's structured `send()` this sender uses. */
export interface SendEmailBinding {
  send(message: {
    to: string;
    from: { email: string; name?: string };
    subject: string;
    text: string;
    html?: string;
    headers?: Record<string, string>;
  }): Promise<{ messageId: string }>;
}

export interface MailEnv {
  EMAIL?: SendEmailBinding;
  /** The configured sender address (`mail.from` in cloudhal.json). */
  CLOUDHAL_MAIL_FROM?: string;
  CLOUDHAL_MAIL_FROM_NAME?: string;
}

/** A plain `local@domain` address: no display name, no spaces or line breaks. */
export const MAIL_ADDRESS = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

export function cloudflareEmailSender(
  binding: SendEmailBinding,
  from: { email: string; name?: string },
): MailSender {
  const sender = {
    email: from.email,
    ...(from.name && oneLine(from.name) ? { name: oneLine(from.name) } : {}),
  };
  return {
    id: "cloudflare-email",
    async send(message: MailMessage) {
      try {
        await binding.send({
          to: message.to,
          from: sender,
          subject: oneLine(message.subject),
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
          // RFC 3834: auto-responders must not answer.
          headers: { "Auto-Submitted": "auto-generated" },
        });
      } catch (e) {
        throw MailError.from(e);
      }
    },
  };
}

/** The deployment's sender, when the binding and a valid `CLOUDHAL_MAIL_FROM` are both there. */
export function adminMail(env: MailEnv): MailSender | undefined {
  const from = env.CLOUDHAL_MAIL_FROM?.trim();
  if (!env.EMAIL || !from || !MAIL_ADDRESS.test(from)) return undefined;
  return cloudflareEmailSender(env.EMAIL, {
    email: from,
    ...(env.CLOUDHAL_MAIL_FROM_NAME ? { name: env.CLOUDHAL_MAIL_FROM_NAME } : {}),
  });
}
