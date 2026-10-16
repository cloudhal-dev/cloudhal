import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromeGet, chromeSet } from "../src/commands/chrome.ts";
import { init } from "../src/commands/init.ts";

describe("cloudhal chrome (RFC-0025)", () => {
  let tmp: string;
  let projectDir: string;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-chrome-cli-"));
    projectDir = path.join(tmp, "site");
    await init({ dir: projectDir, name: "Chrome Site" });
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("writes the chrome file, sets it back with the same checks, and refuses what misfits", async () => {
    expect(JSON.parse(await chromeGet({ projectDir }))).toEqual({
      header: {},
      footer: {},
      brand: {},
    });
    await writeFile(
      path.join(projectDir, "chrome.json"),
      JSON.stringify({
        header: {
          behavior: "sticky",
          actions: [{ kind: "button", label: "Start", href: "/start" }],
        },
        footer: { layout: "minimal", copyright: "© {year} {site}" },
        brand: { social: [{ network: "github", href: "https://github.com/x" }] },
      }),
    );
    const saved = await chromeSet({ projectDir, file: "chrome.json" });
    expect(saved.header).toMatchObject({ behavior: "sticky" });
    await chromeGet({ projectDir, file: "out.json" });
    const out = JSON.parse(await readFile(path.join(projectDir, "out.json"), "utf8"));
    expect(out.footer).toEqual({ layout: "minimal", copyright: "© {year} {site}" });
    expect(out.brand.social).toHaveLength(1);

    await writeFile(
      path.join(projectDir, "bad.json"),
      JSON.stringify({ header: { nav: "nowhere" } }),
    );
    await expect(chromeSet({ projectDir, file: "bad.json" })).rejects.toThrow(/no menu "nowhere"/);
    await expect(chromeSet({ projectDir })).rejects.toThrow(/usage/);
  });
});
