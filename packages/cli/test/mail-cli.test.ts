/**
 * RFC-0011 in the CLI: cloudhal.json `mail` (strict: a typo must not switch mail off silently), the
 * admin Worker's `send_email` binding locked to that one sender, and `cloudhal studio`'s terminal
 * sender that prints instead of sending.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adminWorkerConfig } from "../src/cloudflare/config.ts";
import { terminalMailSender } from "../src/commands/mail-local.ts";
import { parseMailConfig, readProjectConfig, writeProjectConfig } from "../src/config.ts";

describe("email delivery (RFC-0011)", () => {
  it("cloudhal.json `mail`: a plain sender address, an optional one-line name; kept on write", async () => {
    expect(parseMailConfig(undefined)).toBeUndefined();
    expect(parseMailConfig({ from: " studio@example.com ", fromName: "Acme\nStudio" })).toEqual({
      from: "studio@example.com",
      fromName: "Acme Studio",
    });
    expect(parseMailConfig({ from: "studio@example.com", fromName: 7 })).toEqual({
      from: "studio@example.com",
    });
    for (const bad of [
      "studio@example.com",
      {},
      { from: "Studio <studio@example.com>" },
      { from: "studio@example.com\r\nBcc: x@evil.test" },
      { from: "studio" },
    ])
      expect(() => parseMailConfig(bad)).toThrow(/mail/);

    const tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-mail-cfg-"));
    try {
      await writeFile(
        path.join(tmp, "cloudhal.json"),
        JSON.stringify({ siteId: "site_abcdefgh", mail: { from: "studio@example.com" } }),
      );
      const cfg = await readProjectConfig(tmp);
      expect(cfg.mail).toEqual({ from: "studio@example.com" });
      await writeProjectConfig(tmp, cfg);
      expect((await readProjectConfig(tmp)).mail).toEqual({ from: "studio@example.com" });
      await writeFile(
        path.join(tmp, "cloudhal.json"),
        JSON.stringify({ siteId: "site_abcdefgh", mail: { from: "studio at example.com" } }),
      );
      await expect(readProjectConfig(tmp)).rejects.toThrow(/mail\.from must be a plain address/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("the admin Worker gets a send_email binding locked to the sender, and the sender vars", () => {
    const admin = { name: "news", studioDir: "studio", main: "./worker.ts" };
    const off = adminWorkerConfig(admin);
    expect(off).not.toHaveProperty("send_email");
    expect(off.vars).not.toHaveProperty("CLOUDHAL_MAIL_FROM");
    const on = adminWorkerConfig({
      ...admin,
      mail: { from: "studio@example.com", fromName: "Acme Studio" },
    });
    expect(on.send_email).toEqual([
      { name: "EMAIL", allowed_sender_addresses: ["studio@example.com"] },
    ]);
    expect(on.vars).toMatchObject({
      CLOUDHAL_MAIL_FROM: "studio@example.com",
      CLOUDHAL_MAIL_FROM_NAME: "Acme Studio",
    });
  });

  it("cloudhal studio prints mail instead of sending it", async () => {
    let out = "";
    const mail = terminalMailSender({ from: "studio@example.com", fromName: "Acme" }, (t) => {
      out += t;
    });
    expect(mail.id).toBe("terminal");
    await mail.send({
      to: "ada@example.org",
      subject: "Reset your password",
      text: "Choose a new password: http://localhost:8787/reset-password#chrst_x",
    });
    expect(out).toContain("From: Acme <studio@example.com>");
    expect(out).toContain("To: ada@example.org");
    expect(out).toContain("/reset-password#chrst_x");
    expect(out).toContain("printed, not sent");
  });
});
