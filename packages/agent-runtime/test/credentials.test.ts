import { describe, expect, it } from "vitest";
import { agentCredential, type Principal } from "../src/index.ts";

const agent = { kind: "agent" as const, id: "agent_cred000001" };
const human = { kind: "human" as const, id: "user_cred0000001" };

describe("agentCredential (RFC-0044 §5 inv. 5)", () => {
  it("names a key or an OAuth connection; people and the local server have none", () => {
    const p = (extra: Partial<Principal>): Principal => ({ actor: agent, scopes: [], ...extra });
    expect(agentCredential(p({ keyId: "k1" }))).toEqual({ kind: "key", id: "k1" });
    expect(agentCredential(p({ grantId: "g1" }))).toEqual({ kind: "grant", id: "g1" });
    expect(agentCredential(p({ local: true, keyId: "k1" }))).toBeUndefined();
    expect(agentCredential(p({}))).toBeUndefined();
    expect(agentCredential({ actor: human, scopes: [], grantId: "g1" })).toBeUndefined();
  });
});
