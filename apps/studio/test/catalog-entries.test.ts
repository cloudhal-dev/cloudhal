/** Alert 37: the i18n codemod decodes string literals of either quote without breaking escapes. */
import { describe, expect, it } from "vitest";
import { stringBodyAsJson } from "../../../scripts/i18n-codemod/catalog-entries.ts";

const decode = (body: string) => JSON.parse(`"${stringBodyAsJson(body)}"`) as string;

describe("stringBodyAsJson", () => {
  it("decodes what the literal means", () => {
    expect(decode("plain")).toBe("plain");
    expect(decode("it\\'s")).toBe("it's");
    expect(decode('say "hi"')).toBe('say "hi"');
    expect(decode('a\\"b')).toBe('a"b');
    expect(decode("back\\\\slash")).toBe("back\\slash");
    expect(decode('back\\\\"')).toBe('back\\"');
    expect(decode("line\\nbreak \\u00e9")).toBe("line\nbreak \u00e9");
  });
});
