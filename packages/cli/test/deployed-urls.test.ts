import { describe, expect, it } from "vitest";
import { deployedUrls } from "../src/cloudflare/wrangler.ts";

describe("deployedUrls", () => {
  it("turns wrangler's deploy targets into URLs", () => {
    const records = [
      { type: "wrangler-session" },
      {
        type: "deploy",
        targets: ["cloudhal-com-admin.example.workers.dev", "https://x.example.com"],
      },
    ];
    expect(deployedUrls(records)).toEqual([
      "https://cloudhal-com-admin.example.workers.dev",
      "https://x.example.com",
    ]);
  });

  it("keeps only the hostname of a custom domain target (a fresh CI checkout parses it)", () => {
    const urls = deployedUrls([{ type: "deploy", targets: ["cloudhal.com (custom domain)"] }]);
    expect(urls).toEqual(["https://cloudhal.com"]);
    expect(new URL(urls[0] as string).hostname).toBe("cloudhal.com");
  });
});
