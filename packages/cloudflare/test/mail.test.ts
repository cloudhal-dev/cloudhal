/**
 * RFC-0011: the Cloudflare Email Service sender — one locked sender, plain text, a fixed
 * `Auto-Submitted` header, one-line subjects, the binding's error codes as `MailError`s.
 */
import { MailError } from "@cloudhal/api";
import { describe, expect, it } from "vitest";
import { adminMail, cloudflareEmailSender, type SendEmailBinding } from "../src/mail.ts";

function binding(fail?: { code?: string; message: string }) {
  const sent: Parameters<SendEmailBinding["send"]>[0][] = [];
  const b: SendEmailBinding = {
    async send(message) {
      if (fail) throw Object.assign(new Error(fail.message), fail.code ? { code: fail.code } : {});
      sent.push(message);
      return { messageId: `m${sent.length}` };
    },
  };
  return { b, sent };
}

describe("cloudflareEmailSender", () => {
  it("sends from the configured address with one-line subjects and Auto-Submitted", async () => {
    const { b, sent } = binding();
    const mail = cloudflareEmailSender(b, { email: "studio@example.com", name: "Acme\r\nStudio" });
    expect(mail.id).toBe("cloudflare-email");
    await mail.send({
      to: "a@example.org",
      subject: "Hi\r\nBcc: x@evil.test",
      text: "line 1\nline 2",
    });
    expect(sent).toEqual([
      {
        to: "a@example.org",
        from: { email: "studio@example.com", name: "Acme Studio" },
        subject: "Hi Bcc: x@evil.test",
        text: "line 1\nline 2",
        headers: { "Auto-Submitted": "auto-generated" },
      },
    ]);
  });

  it("turns the binding's errors into MailErrors with the service's code", async () => {
    const limited = cloudflareEmailSender(
      binding({ code: "E_RATE_LIMIT_EXCEEDED", message: "slow down" }).b,
      { email: "studio@example.com" },
    );
    const e = await limited.send({ to: "a@example.org", subject: "s", text: "t" }).catch((x) => x);
    expect(e).toBeInstanceOf(MailError);
    expect(e).toMatchObject({
      code: "E_RATE_LIMIT_EXCEEDED",
      retryable: true,
      message: "slow down",
    });

    const unverified = cloudflareEmailSender(
      binding({ code: "E_SENDER_NOT_VERIFIED", message: "verify the domain" }).b,
      { email: "studio@example.com" },
    );
    expect(
      await unverified.send({ to: "a@example.org", subject: "s", text: "t" }).catch((x) => x),
    ).toMatchObject({ code: "E_SENDER_NOT_VERIFIED", retryable: false });

    const odd = cloudflareEmailSender(binding({ message: "boom" }).b, { email: "s@example.com" });
    expect(
      await odd.send({ to: "a@example.org", subject: "s", text: "t" }).catch((x) => x),
    ).toMatchObject({ code: "E_UNKNOWN", retryable: false });
  });

  it("adminMail: only with the binding and a plain sender address", () => {
    const { b } = binding();
    expect(adminMail({})).toBeUndefined();
    expect(adminMail({ EMAIL: b })).toBeUndefined();
    expect(adminMail({ CLOUDHAL_MAIL_FROM: "studio@example.com" })).toBeUndefined();
    expect(
      adminMail({ EMAIL: b, CLOUDHAL_MAIL_FROM: "Studio <studio@example.com>" }),
    ).toBeUndefined();
    expect(adminMail({ EMAIL: b, CLOUDHAL_MAIL_FROM: " studio@example.com " })?.id).toBe(
      "cloudflare-email",
    );
  });
});
