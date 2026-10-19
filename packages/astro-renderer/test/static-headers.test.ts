/**
 * Static builds carry the Site Worker's security headers in `_headers` (the audit's "no CSP on
 * static installs"): the same `SITE_CSP`, nosniff and referrer policy, never over the owner's rule.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SITE_CSP } from "../src/csp.ts";
import { writeStaticSecurityHeaders } from "../src/static-headers.ts";

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

describe("_headers security rule for static builds", () => {
  it("adds one /* rule with the site's CSP, idempotently, after rules already there", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cloudhal-security-headers-"));
    dirs.push(dir);
    await writeFile(join(dir, "_headers"), "/media/*\n  Cache-Control: public, max-age=60\n");
    expect(await writeStaticSecurityHeaders(dir)).toBe(true);
    expect(await writeStaticSecurityHeaders(dir)).toBe(false);
    expect(await readFile(join(dir, "_headers"), "utf8")).toBe(
      [
        "/media/*",
        "  Cache-Control: public, max-age=60",
        "",
        "/*",
        `  Content-Security-Policy: ${SITE_CSP}`,
        "  X-Content-Type-Options: nosniff",
        "  Referrer-Policy: strict-origin-when-cross-origin",
        "",
      ].join("\n"),
    );
  });

  it("keeps an owner's own /* rule as it is", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cloudhal-security-headers-"));
    dirs.push(dir);
    const own = "/*\n  Content-Security-Policy: default-src 'self' https://embed.example\n";
    await writeFile(join(dir, "_headers"), own);
    expect(await writeStaticSecurityHeaders(dir)).toBe(false);
    expect(await readFile(join(dir, "_headers"), "utf8")).toBe(own);
  });
});
