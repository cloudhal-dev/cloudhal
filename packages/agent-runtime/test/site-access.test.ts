import { describe, expect, it } from "vitest";
import type { Principal } from "../src/policy.ts";
import { roleScopes } from "../src/roles.ts";
import { forInstallation, forSite, isSiteLimited, visibleSites } from "../src/site-access.ts";

const person = (
  role: Principal["person"] extends infer P ? NonNullable<P>["role"] : never,
  sites?: Record<string, "editor" | "author" | "contributor">,
) => ({
  id: "user_aaaaaaaa",
  userId: "u1",
  role,
  ...(sites ? { sites } : {}),
});

describe("per-site roles (RFC-0034 A2)", () => {
  it("leaves unlimited people and Administrators as they are", () => {
    const admin: Principal = {
      actor: { kind: "human", id: "user_aaaaaaaa" },
      scopes: roleScopes("administrator"),
      person: person("administrator", { site_a: "author" }),
    };
    expect(isSiteLimited(admin.person)).toBe(false);
    expect(forSite(admin, "site_b")).toBe(admin);
    expect(visibleSites(admin, ["site_a", "site_b"])).toEqual(["site_a", "site_b"]);
  });

  it("gives a limited person the site's role and nothing elsewhere", () => {
    const p: Principal = {
      actor: { kind: "human", id: "user_aaaaaaaa" },
      scopes: roleScopes("editor"),
      person: person("editor", { site_a: "contributor" }),
    };
    expect(forSite(p, "site_b")).toBeUndefined();
    const a = forSite(p, "site_a");
    expect(a?.person?.role).toBe("contributor");
    expect(a?.scopes).toEqual(roleScopes("contributor"));
    expect(visibleSites(p, ["site_a", "site_b"])).toEqual(["site_a"]);
    expect(forInstallation(p).scopes).not.toContain("members:invite");
    expect(forInstallation(p).scopes).not.toContain("audit:read");
  });

  it("narrows a limited person's key to the site role and caps its mode", () => {
    const agent: Principal = {
      actor: { kind: "agent", id: "agent_aaaaaaaa" },
      scopes: ["content:write", "site:publish"],
      keyScopes: ["content:write", "site:publish"],
      mode: "auto",
      person: person("editor", { site_a: "contributor", site_b: "author" }),
    };
    const a = forSite(agent, "site_a");
    expect(a?.mode).toBe("edits");
    expect(a?.scopes).not.toContain("site:publish");
    const b = forSite(agent, "site_b");
    expect(b?.scopes).toEqual(["content:write:own", "site:publish:own"]);
    expect(b?.mode).toBe("auto");
  });
});
