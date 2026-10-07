import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { describe, expect, it } from "vitest";
import { bundleAll } from "../scripts/bundle.ts";
import { ROOT_SCHEMAS } from "../scripts/schema-list.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(here, "../fixtures");

const bundled = await bundleAll();
// ajv-formats is CommonJS (`module.exports = plugin; plugin.default = plugin`); under
// nodenext the default import is the module object, so take `.default` explicitly.
const addFormats = addFormatsModule.default;
const ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: false });
addFormats(ajv);
for (const [name, schema] of bundled) ajv.addSchema(schema, name);

async function listJson(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

describe("bundled schemas", () => {
  it.each(ROOT_SCHEMAS)("%s is a valid 2020-12 schema with no cross-file refs", (name) => {
    const schema = bundled.get(name);
    expect(schema).toBeDefined();
    expect(ajv.validateSchema(schema as object)).toBe(true);
    const text = JSON.stringify(schema);
    expect(text).not.toMatch(/"\$ref":"[^#"][^"]*"/);
  });
});

for (const name of ROOT_SCHEMAS) {
  describe(`${name} fixtures`, async () => {
    const validFiles = await listJson(path.join(FIXTURES, "valid", name));
    const invalidFiles = await listJson(path.join(FIXTURES, "invalid", name));

    it("has at least one valid and one invalid fixture", () => {
      expect(validFiles.length).toBeGreaterThan(0);
      expect(invalidFiles.length).toBeGreaterThan(0);
    });

    it.each(validFiles)("valid/%s passes", async (file) => {
      const data = JSON.parse(await readFile(path.join(FIXTURES, "valid", name, file), "utf8"));
      const ok = ajv.validate(name, data);
      expect(ok, ajv.errorsText(ajv.errors)).toBe(true);
    });

    it.each(invalidFiles)("invalid/%s fails", async (file) => {
      const wrapper = JSON.parse(
        await readFile(path.join(FIXTURES, "invalid", name, file), "utf8"),
      );
      expect(typeof wrapper.reason).toBe("string");
      expect(ajv.validate(name, wrapper.data)).toBe(false);
    });
  });
}
