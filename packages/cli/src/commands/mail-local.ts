/**
 * RFC-0011 offline: with `mail` in cloudhal.json, `cloudhal studio` prints every mail to the
 * terminal instead of sending it, so invites and reset links can be tried without Email Service.
 */
import type { MailMessage, MailSender } from "@cloudhal/api";
import type { MailConfig } from "../config.ts";

export function terminalMailSender(
  cfg: MailConfig,
  write: (text: string) => void = (text) => process.stdout.write(text),
): MailSender {
  const from = cfg.fromName ? `${cfg.fromName} <${cfg.from}>` : cfg.from;
  return {
    id: "terminal",
    async send(message: MailMessage) {
      write(
        [
          "── mail (printed, not sent: cloudhal studio) ──",
          `From: ${from}`,
          `To: ${message.to}`,
          `Subject: ${message.subject}`,
          "",
          message.text,
          "──",
          "",
        ].join("\n"),
      );
    },
  };
}
