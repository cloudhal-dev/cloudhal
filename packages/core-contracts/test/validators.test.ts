import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROOT_SCHEMAS } from "../scripts/schema-list.ts";
import {
  assertValid,
  ContractValidationError,
  isValid,
  validationErrors,
} from "../src/validate.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(here, "../fixtures");

async function listJson(dir: string): Promise<string[]> {
  return (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
}

describe("precompiled validators (ajv standalone)", () => {
  for (const name of ROOT_SCHEMAS) {
    it(`${name}: accepts valid fixtures and rejects invalid ones`, async () => {
      for (const file of await listJson(path.join(FIXTURES, "valid", name))) {
        const data = JSON.parse(await readFile(path.join(FIXTURES, "valid", name, file), "utf8"));
        expect(
          isValid(name, data),
          `${file}: ${JSON.stringify(validationErrors(name, data))}`,
        ).toBe(true);
        expect(() => assertValid(name, data)).not.toThrow();
      }
      for (const file of await listJson(path.join(FIXTURES, "invalid", name))) {
        const { data } = JSON.parse(
          await readFile(path.join(FIXTURES, "invalid", name, file), "utf8"),
        );
        expect(isValid(name, data), file).toBe(false);
        expect(validationErrors(name, data).length, file).toBeGreaterThan(0);
        expect(() => assertValid(name, data)).toThrow(ContractValidationError);
      }
    });
  }

  it("narrows types", () => {
    const data: unknown = {
      id: "sec_01HZX8K3Q9QR",
      kind: "richText",
      format: "markdown",
      body: "x",
    };
    if (isValid("section", data)) {
      expect(data.kind).toBe("richText");
    } else {
      throw new Error("expected valid");
    }
  });
});
