/**
 * `cloudhal owner transfer --to <email>` (RFC-0005 open question 7): the operator recovers a
 * locked-out deployment with the deployment token. Runs against an in-process admin API with real
 * Better Auth, the way `deploy.test.ts` runs push/pull.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApi } from "@cloudhal/api";
import { createAuthFor } from "@cloudhal/api/auth/node";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { main } from "../src/cli.ts";
import { transferOwner } from "../src/index.ts";

const TOKEN = "owner-cli-deploy-token-0123456789abcdefgh";
const PASSWORD = "correct horse battery staple";

describe("cloudhal owner transfer", () => {
  let tmp: string;
  let projectDir: string;
  let fakeFetch: typeof fetch;
  let call: (p: string, init?: RequestInit) => Promise<Response>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-owner-"));
    projectDir = path.join(tmp, "site");
    const dataDir = path.join(projectDir, ".cloudhal");
    await mkdir(path.join(dataDir, "deploy"), { recursive: true });
    await writeFile(
      path.join(projectDir, "cloudhal.json"),
      JSON.stringify({ siteId: "site_ownercli0001", dataDir: ".cloudhal" }),
    );
    await writeFile(
      path.join(dataDir, "deploy/state.json"),
      JSON.stringify({ adminUrl: "https://admin.example" }),
    );
    await writeFile(
      path.join(dataDir, "deploy/secrets.json"),
      JSON.stringify({ CLOUDHAL_DEPLOY_TOKEN: TOKEN }),
    );
    // the "deployed" admin API: its own data directory
    const remoteDir = path.join(tmp, "remote");
    const local = await openLocalStore(remoteDir);
    const auth = await createAuthFor({ dataDir: local.dataDir, baseURL: "https://admin.example" });
    const app = createApi({
      store: local.store,
      resolvePrincipal: auth.resolvePrincipal,
      authHandler: auth.handler,
      agentKeys: auth.agentKeys,
      staff: auth.staff,
      admin: { deployToken: TOKEN, storage: { sql: local.sql, blobs: local.blobs } },
    });
    fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
      app.fetch(new Request(input, init))) as typeof fetch;
    call = async (p, init) =>
      app.fetch(
        new Request(`https://admin.example${p}`, {
          ...init,
          headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
        }),
      );
    close = () => local.close();
  });

  afterAll(async () => {
    await close?.();
    await rm(tmp, { recursive: true, force: true });
  });

  it("makes a member the Owner with the deployment token; the old Owner becomes an Administrator", async () => {
    const signUp = await call("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ name: "Lost Owner", email: "lost@example.com", password: PASSWORD }),
    });
    expect(signUp.status, await signUp.clone().text()).toBe(200);
    const ownerCookie = (signUp.headers.get("set-cookie") ?? "").split(";")[0] as string;
    const invite = await call("/api/invites", {
      method: "POST",
      headers: { cookie: ownerCookie },
      body: JSON.stringify({ email: "rescuer@example.com", role: "editor" }),
    });
    const token = ((await invite.json()) as { url: string }).url.split("#")[1];
    const accepted = await call("/api/invites/accept", {
      method: "POST",
      body: JSON.stringify({ token, name: "Rescuer", password: PASSWORD }),
    });
    expect(accepted.status, await accepted.clone().text()).toBe(200);
    const rescuerCookie = (accepted.headers.get("set-cookie") ?? "").split(";")[0] as string;

    await expect(
      transferOwner({ projectDir, to: "nobody@example.com", fetch: fakeFetch }),
    ).rejects.toThrow(/no member with the email nobody@example.com/);
    const lines: string[] = [];
    const result = await transferOwner({
      projectDir,
      to: "rescuer@example.com",
      fetch: fakeFetch,
      log: (l) => lines.push(l),
    });
    expect(result).toMatchObject({ email: "rescuer@example.com", name: "Rescuer" });
    expect(lines).toEqual(["Rescuer <rescuer@example.com> is now the Owner"]);
    const role = async (cookie: string) =>
      ((await (await call("/api/me", { headers: { cookie } })).json()) as { role: string }).role;
    expect(await role(rescuerCookie)).toBe("owner");
    expect(await role(ownerCookie)).toBe("administrator");
  });

  it("needs the deployment token and a usable --to", async () => {
    const wrong = path.join(tmp, "wrong");
    await mkdir(path.join(wrong, ".cloudhal/deploy"), { recursive: true });
    await writeFile(path.join(wrong, "cloudhal.json"), JSON.stringify({ siteId: "site_x00001" }));
    await writeFile(
      path.join(wrong, ".cloudhal/deploy/secrets.json"),
      JSON.stringify({ CLOUDHAL_DEPLOY_TOKEN: "not-the-token-not-the-token-not-the-token" }),
    );
    await expect(
      transferOwner({
        projectDir: wrong,
        to: "rescuer@example.com",
        adminUrl: "https://admin.example",
        fetch: fakeFetch,
      }),
    ).rejects.toThrow(/owner transfer failed \(401\)/);
    await expect(main(["owner", "transfer"])).rejects.toThrow(/usage: cloudhal owner transfer/);
    await expect(main(["owner", "promote", "--to", "a@example.com"])).rejects.toThrow(/usage/);
  });
});
