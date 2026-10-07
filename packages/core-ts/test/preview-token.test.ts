import { describe, expect, it } from "vitest";
import { mintPreviewToken, PreviewTokenError, verifyPreviewToken } from "../src/preview-token.ts";

const SECRET = "preview-secret-of-at-least-thirty-two-bytes";
const reason = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof PreviewTokenError ? e.reason : String(e);
  }
};

describe("preview tokens", () => {
  it("round-trips live and snapshot targets", async () => {
    const live = await mintPreviewToken(SECRET, { site: "site_abc123", target: "live" });
    expect(await verifyPreviewToken(SECRET, live, "site_abc123")).toMatchObject({
      site: "site_abc123",
      target: "live",
    });
    const snap = await mintPreviewToken(SECRET, {
      site: "site_abc123",
      target: { snapshot: "snap_xyz789" },
      ttlSeconds: 600,
    });
    const claims = await verifyPreviewToken(SECRET, snap, "site_abc123");
    expect(claims.target).toEqual({ snapshot: "snap_xyz789" });
    expect(claims.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(600);
  });

  it("rejects tampering, other sites, expiry, wrong secrets and junk", async () => {
    const now = Date.UTC(2026, 9, 8);
    const token = await mintPreviewToken(SECRET, { site: "site_abc123", target: "live", ttlSeconds: 120, now });
    const [p, m] = token.split(".") as [string, string];
    const forged = `${btoa(JSON.stringify({ site: "site_abc123", target: "live", exp: 9e9 })).replace(/=+$/, "")}.${m}`;
    expect(await reason(verifyPreviewToken(SECRET, forged, "site_abc123", now))).toBe("signature");
    expect(await reason(verifyPreviewToken(SECRET, token, "site_other1", now))).toBe("site");
    expect(await reason(verifyPreviewToken(SECRET, token, "site_abc123", now + 121_000))).toBe("expired");
    expect(await reason(verifyPreviewToken(`${SECRET}x`, token, "site_abc123", now))).toBe("signature");
    expect(await reason(verifyPreviewToken(SECRET, "nope", "site_abc123", now))).toBe("malformed");
    expect(await reason(verifyPreviewToken(SECRET, `${p}.${m}.x`, "site_abc123", now))).toBe("malformed");
    await expect(mintPreviewToken("short", { site: "s", target: "live" })).rejects.toThrow(RangeError);
  });
});
