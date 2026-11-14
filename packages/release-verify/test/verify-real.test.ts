/**
 * RFC-0046 §11a on the real v0.9.0 statement, signature and manifest (committed byte for byte).
 * The 7.2 MB tarball is not committed, so a passing run of steps 1 to 5 shows as the step-6
 * refusal `tarball-mismatch`; test/real-tarball.test.ts checks the real tarball where CI has it.
 */
import { describe, expect, it } from "vitest";
import {
  type ReleaseKeys,
  type ReleaseVerifyErrorCode,
  type VerifyReleaseInput,
  verifyRelease,
} from "../src/index.ts";
import { fixture, flip, realInput } from "./helpers.ts";

const KEY_ID = "cloudhal-release-2026a";

async function codeOf(input: VerifyReleaseInput): Promise<ReleaseVerifyErrorCode | "ok"> {
  try {
    await verifyRelease(input);
    return "ok";
  } catch (e) {
    return (e as { code: ReleaseVerifyErrorCode }).code;
  }
}

describe("the real v0.9.0 release", () => {
  it("passes steps 1 to 5 with the pinned key: only the missing tarball is refused", async () => {
    await expect(verifyRelease(realInput())).rejects.toMatchObject({
      code: "tarball-mismatch",
      name: "ReleaseVerifyError",
    });
  });

  it("refuses a flipped byte in each file", async () => {
    const statement = fixture("release-statement.json");
    // Inside the commit hash: still valid JSON, so the signature is what fails.
    const at = new TextDecoder().decode(statement).indexOf("6bfe74a1");
    expect(await codeOf(realInput({ statement: flip(statement, at + 2) }))).toBe(
      "signature-invalid",
    );
    expect(await codeOf(realInput({ signature: flip(fixture("release-statement.sig")) }))).toBe(
      "signature-invalid",
    );
    expect(await codeOf(realInput({ manifest: flip(fixture("manifest.json")) }))).toBe(
      "manifest-mismatch",
    );
  });

  it("refuses a wrong key, an unknown key id and a revoked key", async () => {
    const other: ReleaseKeys = {
      [KEY_ID]: { publicKey: "7az3pPc4oT0AOfRcdfOZZQkM6XAGHo2jXEdDZ1qEVR0=", status: "active" },
    };
    expect(await codeOf(realInput({ keys: other }))).toBe("signature-invalid");
    expect(await codeOf(realInput({ keys: {} }))).toBe("key-unknown");
    expect(
      await codeOf(
        realInput({
          keys: { [KEY_ID]: { publicKey: "c2hvcnQ=", status: "active" } },
        }),
      ),
    ).toBe("key-unknown");
    const revoked: ReleaseKeys = {
      [KEY_ID]: { publicKey: "7az3pPc4oT0AOfRcdfOZZQkM6XAGHo2jXEdDZ1qEVR8=", status: "revoked" },
    };
    expect(await codeOf(realInput({ keys: revoked }))).toBe("key-revoked");
    expect(await codeOf(realInput({ revoked: [KEY_ID] }))).toBe("key-revoked");
  });

  it("refuses a request for another version or channel (invariant 7)", async () => {
    expect(await codeOf(realInput({ request: { version: "0.9.1" } }))).toBe("wrong-version");
    expect(await codeOf(realInput({ request: { version: "0.8.0" } }))).toBe("wrong-version");
    expect(await codeOf(realInput({ request: { version: "0.9.0", channel: "next" } }))).toBe(
      "wrong-channel",
    );
  });

  it("refuses a planVersion above what the caller supports", async () => {
    expect(await codeOf(realInput({ planVersion: 0 }))).toBe("plan-version-unsupported");
  });

  it("checks sizes first: a large statement, a short signature", async () => {
    const big = new Uint8Array(4097).fill(0x20);
    expect(await codeOf(realInput({ statement: big }))).toBe("statement-too-large");
    const sig = fixture("release-statement.sig").subarray(0, 63);
    expect(await codeOf(realInput({ signature: sig }))).toBe("signature-size");
  });

  it("names nothing but its code and message: no key material, no file contents", async () => {
    const e = await verifyRelease(realInput({ manifest: flip(fixture("manifest.json")) })).catch(
      (x: Error) => x,
    );
    expect(String((e as Error).message)).toBe("manifest.json is not the file the statement pins");
  });
});
