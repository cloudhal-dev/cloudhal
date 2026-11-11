/**
 * RFC-0045 §6 and rollout step 1: every `$ref` in every tool's input and output schema resolves
 * (`defsClosure` replaced `update_collection`'s hand-written `$defs`), `update_collection` lists
 * only the enabled field types, and a reference or repeater definition is refused through it.
 */
import { AuditLog, PolicyEngine } from "@cloudhal/agent-runtime";
import { SiteSchema } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { FIELD_DEFINITIONS_INPUT } from "../src/collection-fields.ts";
import type { JsonSchema } from "../src/common.ts";
import { defsClosure } from "../src/schema-transforms.ts";
import { defineTools, runTool, toolPolicies } from "../src/tools.ts";

const tools = defineTools();

/** Every `$ref` under `node`, with where it sits. */
function refs(node: unknown, at = "", out: [string, string][] = []): [string, string][] {
  if (Array.isArray(node))
    node.forEach((n, i) => {
      refs(n, `${at}/${i}`, out);
    });
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node as Record<string, unknown>))
      if (k === "$ref" && typeof v === "string") out.push([at, v]);
      else refs(v, `${at}/${k}`, out);
  return out;
}

/** The node a local JSON pointer (`#/$defs/X`, `#/properties/a`) names in `root`, if any. */
function resolve(root: unknown, ref: string): unknown {
  if (!ref.startsWith("#")) return undefined;
  let node: unknown = root;
  for (const raw of ref.slice(2).split("/").filter(Boolean)) {
    const key = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!node || typeof node !== "object" || !Object.hasOwn(node, key)) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

describe("tool schemas", () => {
  it("resolve every $ref in every tool's input and output schema", () => {
    const dangling: string[] = [];
    for (const tool of tools)
      for (const [which, schema] of [
        ["input", tool.inputSchema],
        ["output", tool.outputSchema],
      ] as const)
        for (const [at, ref] of refs(schema))
          if (resolve(schema, ref) === undefined)
            dangling.push(`${tool.name} ${which}${at}: ${ref}`);
    expect(dangling).toEqual([]);
  });

  it("offers update_collection the enabled field types only", () => {
    const defs = FIELD_DEFINITIONS_INPUT.$defs as Record<string, JsonSchema>;
    const variants = (defs.FieldDefinition?.oneOf ?? []) as JsonSchema[];
    const types = variants.map(
      (v) => (v.properties as Record<string, { enum: string[] }>).type?.enum[0],
    );
    expect(types).toEqual([
      "text",
      "richText",
      "number",
      "boolean",
      "date",
      "datetime",
      "url",
      "image",
      "select",
    ]);
    // no marker, and nothing the stage-4 variants alone need
    expect(variants.every((v) => !("migration" in (v.properties as object)))).toBe(true);
    expect(Object.keys(defs).sort()).toEqual([
      "FieldDefinition",
      "FieldKey",
      "FieldLabel",
      "FieldLabels",
      "FieldOption",
      "Locale",
      "Slug",
    ]);
  });
});

describe("defsClosure", () => {
  const site = SiteSchema as unknown as JsonSchema;

  it("follows $refs transitively from a $defs name or a node", () => {
    const closure = defsClosure(site, "FieldDefinition");
    for (const name of [
      "FieldDefinition",
      "SubFieldDefinition",
      "FieldCondition",
      "FieldMigration",
      "Id",
    ])
      expect(Object.keys(closure)).toContain(name);
    expect(
      Object.keys(defsClosure(site, { items: { $ref: "#/$defs/FieldLabels" } })).sort(),
    ).toEqual(["FieldLabel", "FieldLabels", "Locale"]);
  });

  it("throws on a reference the schema does not define", () => {
    expect(() => defsClosure(site, { $ref: "#/$defs/Nope" })).toThrow(/Nope/);
  });
});

describe("update_collection and the RFC-0045 gate", () => {
  it("refuses a reference or repeater definition with fields_unsupported", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    const site = await seedStarterSite(store, { name: "Gate", slug: "gate" });
    await store.updateSite({ ...site, collections: { places: {}, events: {} } });
    const tool = tools.find((t) => t.name === "update_collection") as (typeof tools)[number];
    const agent = { kind: "agent" as const, id: "agent_gate0001", name: "Organiser" };
    const label = { en: { label: "Venue" } };
    for (const def of [
      { key: "venue", type: "reference", labels: label, localized: false, collections: ["places"] },
      {
        key: "speakers",
        type: "repeater",
        labels: label,
        localized: false,
        fields: [{ key: "name", type: "text", labels: label }],
      },
    ]) {
      const call = runTool(
        tool,
        { siteId: site.id, collection: "events", fields: [def] },
        { store, principal: { actor: agent, scopes: ["*"], mode: "edits" } },
        {
          policy: new PolicyEngine(toolPolicies(tools)),
          audit: new AuditLog(sql),
          confirmed: true,
        },
      );
      await expect(call).rejects.toMatchObject({ code: "fields_unsupported" });
    }
    expect((await store.getSite(site.id))?.collections?.events?.fields).toBeUndefined();
  });
});
