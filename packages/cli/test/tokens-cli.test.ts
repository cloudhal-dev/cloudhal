/** `cloudhal tokens export` (RFC-0023 §5): the site's tokens as a W3C Design Tokens file. */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { init } from "../src/commands/init.ts";
import { tokensExport } from "../src/commands/tokens.ts";
import { readProjectConfig } from "../src/config.ts";

describe("cloudhal tokens export", () => {
  let tmp: string;
  let projectDir: string;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-tokens-cli-"));
    projectDir = path.join(tmp, "site");
    await init({ dir: projectDir, name: "Token Site" });
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("writes the starter's tokens, then the site's seed, to stdout or a file", async () => {
    const before = JSON.parse(await tokensExport({ projectDir }));
    expect(before.$schema).toBe("https://www.designtokens.org/schemas/2025.10/format.json");
    expect(before.$extensions["dev.cloudhal"].source).toBe("legacy");

    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    const site = await local.store.getSite(cfg.siteId);
    if (!site) throw new Error("no site");
    await local.store.updateSite({
      ...site,
      theme: { ...site.theme, config: { seed: "#0f766e", typeScale: "balanced" } },
    });
    await local.close();

    await tokensExport({ projectDir, out: "design.tokens.json" });
    const after = JSON.parse(await readFile(path.join(projectDir, "design.tokens.json"), "utf8"));
    expect(after.color.light.brand.$value.hex).toBe("#0f766e");
    expect(after["type-step"].$type).toBe("dimension");
    expect(after["type-step"]["0"].$value.unit).toBe("rem");
    await expect(tokensExport({ projectDir, format: "css" })).rejects.toThrow(/only dtcg/);
  });
});
