/**
 * RFC-0016 in the CLI: cloudhal.json `ai` binds Workers AI to the admin Worker; `cloudhal studio`
 * reaches it over REST only with an account id and a token from the environment.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adminWorkerConfig } from "../src/cloudflare/config.ts";
import { localAiTransport } from "../src/commands/studio.ts";
import { readProjectConfig, writeProjectConfig } from "../src/config.ts";

describe("in-editor AI (RFC-0016)", () => {
  it("cloudhal.json `ai` is kept on write and binds AI to the admin Worker only when set", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-ai-cfg-"));
    try {
      await writeFile(
        path.join(tmp, "cloudhal.json"),
        JSON.stringify({ siteId: "site_abcdefgh", ai: {} }),
      );
      const cfg = await readProjectConfig(tmp);
      expect(cfg.ai).toEqual({});
      await writeProjectConfig(tmp, cfg);
      expect((await readProjectConfig(tmp)).ai).toEqual({});
      await writeFile(
        path.join(tmp, "cloudhal.json"),
        JSON.stringify({ siteId: "site_abcdefgh", ai: "yes" }),
      );
      expect((await readProjectConfig(tmp)).ai).toBeUndefined();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
    const admin = { name: "news", studioDir: "studio", main: "./worker.ts" };
    expect(adminWorkerConfig(admin)).not.toHaveProperty("ai");
    expect(adminWorkerConfig({ ...admin, ai: true }).ai).toEqual({ binding: "AI" });
    // RFC-0021 §4: Browser Rendering only when deploy asks for it (default on, `render: false` off).
    expect(adminWorkerConfig(admin)).not.toHaveProperty("browser");
    expect(adminWorkerConfig({ ...admin, browser: true }).browser).toEqual({ binding: "BROWSER" });
  });

  it("cloudhal studio reaches Workers AI over REST only with both variables", () => {
    expect(localAiTransport({})).toEqual({});
    expect(localAiTransport({ CLOUDFLARE_ACCOUNT_ID: "acc" })).toEqual({});
    expect(
      localAiTransport({ CLOUDFLARE_ACCOUNT_ID: "acc", CLOUDHAL_AI_TOKEN: "token" }).transport
        ?.kind,
    ).toBe("rest");
  });
});
