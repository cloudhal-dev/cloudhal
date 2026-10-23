import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.ts";
import { parseFieldsArgs, themeReferences } from "../src/commands/fields.ts";
import { writeProjectConfig } from "../src/index.ts";

const person = { kind: "human" as const, id: "user_fieldscli01", name: "Owner" };

describe("cloudhal fields (RFC-0041 §6)", () => {
  let projectDir: string;
  let siteId: string;
  let entryId: string;
  const log = () => vi.spyOn(console, "log").mockImplementation(() => {});
  const lines = (spy: ReturnType<typeof log>) => spy.mock.calls.map((c) => String(c[0]));

  beforeAll(async () => {
    projectDir = await mkdtemp(path.join(os.tmpdir(), "cloudhal-fields-"));
    const local = await openLocalStore(path.join(projectDir, ".cloudhal"));
    const site = await local.store.createSite({
      projectId: "proj_fieldscli01",
      name: "Events",
      slug: "events",
      defaultLocale: "en",
      locales: ["en"],
      domains: [],
      pageIds: [],
      theme: { name: "blog" },
      collections: {
        events: {
          fields: [
            { key: "venue", type: "text", labels: { en: { label: "Venue" } }, localized: true },
          ],
        },
      },
    });
    siteId = site.id;
    entryId = (
      await local.store.createContentEntry({
        siteId,
        collection: "events",
        slug: "launch",
        locale: "en",
        status: "draft",
        title: "Launch",
        body: { format: "markdown", value: "x" },
        fields: { venue: "Hall" },
        tags: [],
        author: person,
      })
    ).id;
    await local.close();
    await writeProjectConfig(projectDir, { siteId, dataDir: ".cloudhal" });
    await mkdir(path.join(projectDir, "src", "layouts"), { recursive: true });
    await writeFile(
      path.join(projectDir, "src", "layouts", "Event.astro"),
      "<p>{entry.fields.venue}</p>\n",
    );
  });

  afterAll(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  const fields = async () => {
    const local = await openLocalStore(path.join(projectDir, ".cloudhal"));
    try {
      return (await local.store.getContentEntry(entryId))?.fields;
    } finally {
      await local.close();
    }
  };

  it("parses each action and refuses what does not fit", () => {
    expect(parseFieldsArgs(["rename", "events", "a", "b"], {})).toMatchObject({
      kind: "run",
      op: { op: "rename_field", from: "a", to: "b" },
    });
    expect(
      parseFieldsArgs(["retype", "events", "k", "select"], { options: "talk,panel=Panel talk" }),
    ).toMatchObject({
      op: {
        type: "select",
        multiple: false,
        options: [
          { value: "talk", labels: { en: "Talk" } },
          { value: "panel", labels: { en: "Panel talk" } },
        ],
      },
    });
    expect(() => parseFieldsArgs(["localize", "events", "k", "maybe"], {})).toThrow(/usage/);
    expect(() => parseFieldsArgs(["retype", "events", "k", "colour"], {})).toThrow(/type is one/);
    expect(() => parseFieldsArgs(["nope"], {})).toThrow(/usage: cloudhal fields/);
  });

  it("--dry-run reports, greps the theme and writes nothing; a run and its revert", async () => {
    expect(await themeReferences(projectDir, "venue")).toEqual([
      path.join("src", "layouts", "Event.astro"),
    ]);
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(projectDir);
    let out = log();
    expect(await main(["fields", "rename", "events", "venue", "place", "--dry-run"])).toBe(0);
    expect(lines(out)[0]).toContain("rename_field events.venue: would touch 1 of 1 entries");
    expect(lines(out).join("\n")).toContain("theme code reads fields.venue directly");
    out.mockRestore();
    expect(await fields()).toEqual({ venue: "Hall" });

    out = log();
    expect(await main(["fields", "rename", "events", "venue", "place"])).toBe(0);
    const done = lines(out).find((l) => l.startsWith("operation "));
    out.mockRestore();
    expect(await fields()).toEqual({ place: "Hall" });
    const id = /operation (\S+) done/.exec(done ?? "")?.[1] as string;

    out = log();
    expect(await main(["fields", "revert", "events", id])).toBe(0);
    expect(lines(out)[0]).toContain(`reverted ${id}: 1 entries restored`);
    out.mockRestore();
    cwd.mockRestore();
    expect(await fields()).toEqual({ venue: "Hall" });
  });
});
