import { describe, expect, it } from "vitest";
import { canonicalJson, nodeHash, sha256Hex } from "../src/hash.ts";
import { newId } from "../src/ids.ts";

describe("canonicalJson", () => {
  it("sorts keys recursively and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[3,{"y":2,"z":1}]},"b":1}',
    );
  });
  it("hashes are stable regardless of key order", async () => {
    expect(await nodeHash({ a: 1, b: 2 })).toBe(await nodeHash({ b: 2, a: 1 }));
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("newId", () => {
  it("matches the contract Id pattern", () => {
    for (let i = 0; i < 50; i++) expect(newId("page")).toMatch(/^[a-z]+_[A-Za-z0-9]{6,32}$/);
    expect(() => newId("Bad")).toThrow();
  });
});
