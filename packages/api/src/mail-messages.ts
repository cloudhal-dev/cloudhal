/**
 * The mails Cloudhal sends (RFC-0011): plain text, in English, naming the deployment. Every name in
 * them is text the deployment's own staff entered; one-time links carry their token in the fragment.
 */
import type { MailMessage } from "./mail.ts";

const when = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;

export function inviteMail(input: {
  to: string;
  deployment: string;
  inviter: string | null;
  role: string;
  url: string;
  expiresAt: string;
}): MailMessage {
  return {
    to: input.to,
    subject: `You are invited to ${input.deployment}`,
    text: [
      `${input.inviter ?? "Someone"} invited you to join ${input.deployment} as ${input.role}.`,
      "",
      `Accept: ${input.url}`,
      "",
      `The link works once and expires ${when(input.expiresAt)}.`,
      "If you did not expect this invitation, you can ignore this email.",
    ].join("\n"),
  };
}

export function resetMail(input: {
  to: string;
  deployment: string;
  name: string | null;
  url: string;
  expiresAt: string;
}): MailMessage {
  return {
    to: input.to,
    subject: `Reset your password for ${input.deployment}`,
    text: [
      `Hello ${input.name ?? ""}`.trimEnd() + ",",
      "",
      `Someone asked to reset the password of your account on ${input.deployment}.`,
      "",
      `Choose a new password: ${input.url}`,
      "",
      `The link works once and expires ${when(input.expiresAt)}.`,
      "If you did not ask for this, ignore this email: your password stays as it is.",
    ].join("\n"),
  };
}

export function passwordChangedMail(input: {
  to: string;
  deployment: string;
  name: string | null;
  at: string;
}): MailMessage {
  return {
    to: input.to,
    subject: `Your password for ${input.deployment} was changed`,
    text: [
      `Hello ${input.name ?? ""}`.trimEnd() + ",",
      "",
      `The password of your account on ${input.deployment} was changed at ${when(input.at)}, and every session was signed out.`,
      "",
      "If this was not you, ask an administrator of the deployment for a reset link now.",
    ].join("\n"),
  };
}
