import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const require = createRequire(path.join(here, "../package.json"));

/** The catalog's flat `name: version` entries (pnpm-workspace.yaml). */
function catalog(): Record<string, string> {
  const out: Record<string, string> = {};
  let inside = false;
  for (const line of readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8").split("\n")) {
    if (/^catalog:\s*$/.test(line)) inside = true;
    else if (inside && /^\S/.test(line)) break;
    else if (inside) {
      const m = line.match(/^\s+"?([^":]+)"?:\s*(\S+)/);
      if (m?.[1] && m[2]) out[m[1]] = m[2];
    }
  }
  return out;
}

describe("better-auth family pins", () => {
  // `@better-auth/api-key` names @better-auth/core, @better-auth/utils and better-call as open
  // peers. Left to npm, a fresh install picks newer releases whose own peers conflict with
  // better-auth's, and `npm create cloudhal` spins forever resolving them (found on 0.1.0).
  // @cloudhal/api therefore depends on exactly the versions better-auth itself uses.
  it("@cloudhal/api pins the versions better-auth depends on", () => {
    // better-auth's exports hide package.json: find it from its entry point.
    let dir = path.dirname(require.resolve("better-auth"));
    while (path.basename(dir) !== "better-auth") dir = path.dirname(dir);
    const ba = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    const api = JSON.parse(readFileSync(path.join(here, "../package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    const versions = catalog();
    for (const name of ["@better-auth/core", "@better-auth/utils", "better-call"]) {
      expect(api.dependencies[name], name).toBe("catalog:");
      expect(versions[name], name).toBe(ba.dependencies[name]);
    }
  });

  // RFC-0044 §7: the OAuth plugins peer-depend on exactly this better-auth (`^1.7.18`), and a
  // second `jose` in the tree resolves a second `@better-auth/core`, whose types no longer match.
  it("keeps the plugins on better-auth's version and jose on the one better-auth resolves", () => {
    const versions = catalog();
    for (const name of [
      "@better-auth/api-key",
      "@better-auth/kysely-adapter",
      "@better-auth/mcp",
      "@better-auth/oauth-provider",
    ])
      expect(versions[name], name).toBe(versions["better-auth"]);
    let dir = path.dirname(require.resolve("better-auth"));
    while (path.basename(dir) !== "better-auth") dir = path.dirname(dir);
    const fromBetterAuth = createRequire(path.join(dir, "package.json"));
    let jose = path.dirname(fromBetterAuth.resolve("jose"));
    while (path.basename(jose) !== "jose") jose = path.dirname(jose);
    const resolved = JSON.parse(readFileSync(path.join(jose, "package.json"), "utf8")) as {
      version: string;
    };
    expect(versions.jose).toBe(resolved.version);
  });
});
