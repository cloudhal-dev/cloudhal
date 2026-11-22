/**
 * What a self-hoster gets (RFC-0047, docs/guides/self-host.md). This test:
 *
 * 1. Runs the image as the compose file does: the SeaweedFS of compose.yml on a private network,
 *    the bucket, the `secrets` the image prints, and the container read-only with a tmpfs /tmp.
 * 2. Checks the instance on its own:
 *    - `/api/health`, and the site the entrypoint creates under `CLOUDHAL_SITE_ID`;
 *    - RFC-0043's 503 before the first publish;
 *    - the first owner, who signs up only with the setup token (#165);
 *    - Studio's page, and `/mcp` refusing an anonymous call;
 *    - a publish live on the next request with no build;
 *    - content surviving a restart.
 * 3. Checks the guard: a Node-image volume is refused.
 * 4. Checks the cluster: a second instance with the same settings serves the same site, and keeps
 *    answering while the first stops (SIGTERM hands its objects over).
 *
 * Run by .github/workflows/docker.yml after every build, and by hand:
 *
 *   node scripts/docker-smoke.ts [--image <ref>] [--platform <os/arch>] [--port <n>] [--keep]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const image = arg("image") ?? "cloudhal:local";
const platform = arg("platform");
const port = Number(arg("port") ?? 18787);
const keep = process.argv.includes("--keep");
const id = `cloudhal-smoke-${process.pid}`;
const net = id;
const store = `${id}-store`;
const a = `${id}-a`;
const b = `${id}-b`;
const ports = { a: { studio: port, site: port + 1 }, b: { studio: port + 2, site: port + 3 } };
const studio = (n: "a" | "b") => `http://localhost:${ports[n].studio}`;
const site = (n: "a" | "b") => `http://127.0.0.1:${ports[n].site}`;
/** The compose file's SeaweedFS image, pinned by digest there. */
const COMPOSE = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../deploy/docker/compose.yml"),
  "utf8",
);
const STORE_IMAGE = /image: (chrislusf\/seaweedfs:\S+)/.exec(COMPOSE)?.[1];
if (!STORE_IMAGE) throw new Error("compose.yml names no SeaweedFS image");
const HOME_H1 = /<h1[^>]*>Smoke Site<\/h1>/;

const docker = (args: string[]): string =>
  execFileSync("docker", args, { encoding: "utf8" }).trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const step = (text: string) => console.log(`✓ ${text}`);
function expect(ok: boolean, what: string, detail?: unknown): void {
  if (!ok) throw new Error(`${what}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`);
}
const plat = platform ? ["--platform", platform] : [];

/** The image's own `secrets`, as the guide makes .env. */
function secrets(): Record<string, string> {
  const text = docker(["run", "--rm", ...plat, image, "secrets"]);
  return Object.fromEntries(
    text
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}

function startStore(env: Record<string, string>): void {
  docker(["network", "create", net]);
  const config = JSON.stringify({
    identities: [
      {
        name: "cloudhal",
        credentials: [{ accessKey: env.AWS_ACCESS_KEY_ID, secretKey: env.AWS_SECRET_ACCESS_KEY }],
        actions: ["Admin", "Read", "Write", "List", "Tagging"],
      },
    ],
  });
  docker([
    "run",
    "-d",
    "--name",
    store,
    "--network",
    net,
    "--network-alias",
    "seaweedfs",
    "--env-file",
    envFile("store", { S3_CONFIG: config }),
    "--entrypoint",
    "/bin/sh",
    STORE_IMAGE as string,
    "-c",
    'printf "%s" "$S3_CONFIG" > /tmp/s3.json && exec weed server -dir=/data -s3 -s3.config=/tmp/s3.json -master.volumeSizeLimitMB=256',
  ]);
}

async function createBucket(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const r = spawnSync(
      "docker",
      ["exec", "-i", store, "weed", "shell", "-master=localhost:9333"],
      { input: "s3.bucket.create -name cloudhal\n", encoding: "utf8" },
    );
    if (/created bucket|already exist/.test(`${r.stdout}${r.stderr}`)) return;
    await sleep(2000);
  }
  throw new Error("SeaweedFS did not create the bucket within 120 s");
}

/** Secrets go to `docker run` in a 0600 file, so a failed command never prints them. */
const envDir = mkdtempSync(path.join(os.tmpdir(), "cloudhal-smoke-"));
function envFile(name: string, env: Record<string, string>): string {
  const file = path.join(envDir, `${name}.env`);
  writeFileSync(
    file,
    Object.entries(env)
      .map(([k, v]) => `${k}=${v}\n`)
      .join(""),
    { mode: 0o600 },
  );
  return file;
}

function runInstance(n: "a" | "b", env: Record<string, string>, volume: string): void {
  const name = n === "a" ? a : b;
  const envArgs = [
    "--env-file",
    envFile(name, {
      ...env,
      CLOUDHAL_S3_ENDPOINT: "http://seaweedfs:8333",
      CLOUDHAL_S3_BUCKET: "cloudhal",
      CLOUDHAL_CLUSTER_ADVERTISE: `${name}:7000`,
      CLOUDHAL_SITE_NAME: "Smoke Site",
      CLOUDHAL_BASE_URL: studio(n),
    }),
  ];
  docker([
    "run",
    "-d",
    "--name",
    name,
    "--network",
    net,
    ...plat,
    "--read-only",
    "--tmpfs",
    "/tmp",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "-p",
    `127.0.0.1:${ports[n].studio}:8787`,
    "-p",
    `127.0.0.1:${ports[n].site}:8788`,
    "-v",
    `${volume}:/data`,
    ...envArgs,
    image,
  ]);
}

async function waitHealthy(name: string): Promise<void> {
  for (let i = 0; i < 90; i++) {
    if (docker(["inspect", "--format", "{{.State.Health.Status}}", name]) === "healthy") return;
    if (docker(["inspect", "--format", "{{.State.Running}}", name]) !== "true")
      throw new Error(`${name} stopped`);
    await sleep(2000);
  }
  throw new Error(`${name} did not become healthy within 180 s`);
}

async function json(
  url: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown; res: Response }> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, body, res };
}

async function until<T>(
  what: string,
  check: () => Promise<T | undefined>,
  seconds = 120,
): Promise<T> {
  for (let i = 0; i < seconds; i++) {
    const v = await check().catch(() => undefined);
    if (v !== undefined) return v;
    await sleep(1000);
  }
  throw new Error(`${what} within ${seconds} s`);
}

const env = secrets();
const volumes = { a: `${id}-a`, b: `${id}-b`, node: `${id}-node` };
startStore(env);
try {
  await createBucket();
  step("SeaweedFS is up with the bucket");
  runInstance("a", env, volumes.a);
  await waitHealthy(a);
  const health = await json(`${studio("a")}/api/health`);
  expect(
    health.status === 200 && (health.body as { ok?: boolean }).ok === true,
    "health",
    health.body,
  );
  step("instance a is healthy and /api/health answers { ok: true }");

  const admin = { authorization: `Bearer ${env.CLOUDHAL_DEPLOY_TOKEN}` };
  await until("the entrypoint did not create the site", async () => {
    const r = await json(`${studio("a")}/api/admin/sites`, { headers: admin });
    const sites = (r.body as { sites?: { id: string }[] }).sites ?? [];
    return sites.some((s) => s.id === env.CLOUDHAL_SITE_ID) ? true : undefined;
  });
  const before = await fetch(`${site("a")}/`);
  expect(before.status === 503, "the site answers 503 before the first publish", before.status);
  await before.body?.cancel();
  step("the site exists under CLOUDHAL_SITE_ID and answers 503 until it is published");

  const origin = studio("a");
  const post = (p: string, body: unknown, headers: Record<string, string> = {}) =>
    json(`${origin}${p}`, {
      method: "POST",
      headers: { origin, "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  const owner = {
    name: "Smoke Owner",
    email: "owner@example.com",
    password: "smoke-test-password",
  };
  const squatter = await post("/api/auth/sign-up/email", owner);
  expect(squatter.status === 403, "sign-up without the setup token is refused", squatter.body);
  const signUp = await post("/api/auth/sign-up/email", owner, {
    "x-cloudhal-setup-token": env.CLOUDHAL_SETUP_TOKEN as string,
  });
  expect(signUp.status === 200, "sign-up of the first owner with the setup token", signUp.body);
  const cookie = signUp.res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0] as string)
    .find((c) => c.includes("better-auth.session_token="));
  if (cookie === undefined) throw new Error("sign-up set no session cookie");
  step("the first owner signed up with the setup token, not without it");

  const home = await fetch(`${origin}/`);
  expect((await home.text()).includes("<title>Cloudhal Studio</title>"), "GET / is Studio");
  const mcp = await post("/mcp", { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  expect(mcp.status === 401, "POST /mcp without credentials answers 401", mcp.status);
  step("Studio is served and /mcp refuses an anonymous call");

  const published = await post(
    `/api/sites/${env.CLOUDHAL_SITE_ID}/snapshots`,
    { publish: true, label: "smoke" },
    { cookie },
  );
  expect(published.status === 201, "publish", published.body);
  const live = await fetch(`${site("a")}/`);
  const liveHtml = await live.text();
  expect(live.status === 200 && HOME_H1.test(liveHtml), "the site is live on the next request", {
    status: live.status,
    start: liveHtml.slice(0, 200),
  });
  step("a publish is live on the next request, with no build");

  docker(["restart", a]);
  await waitHealthy(a);
  const again = await until("the site did not come back after a restart", async () => {
    const r = await fetch(`${site("a")}/`);
    const t = await r.text();
    return r.status === 200 && HOME_H1.test(t) ? t : undefined;
  });
  expect(again.length > 0, "the site after a restart");
  step("content and the published pointer survive a restart");

  docker(["volume", "create", volumes.node]);
  docker([
    "run",
    "--rm",
    "-v",
    `${volumes.node}:/data`,
    "--entrypoint",
    "sh",
    image,
    "-c",
    "echo '{}' > /data/cloudhal.json",
  ]);
  const refused = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      ...plat,
      "-v",
      `${volumes.node}:/data`,
      "--env-file",
      envFile("node", {
        ...env,
        CLOUDHAL_S3_ENDPOINT: "http://seaweedfs:8333",
        CLOUDHAL_S3_BUCKET: "cloudhal",
      }),
      image,
    ],
    { encoding: "utf8" },
  );
  expect(
    refused.status !== 0 && /Node self-host image/.test(`${refused.stdout}${refused.stderr}`),
    "a Node-image volume is refused",
    { status: refused.status, out: `${refused.stdout}${refused.stderr}`.slice(-400) },
  );
  step("a volume of the Node image is refused with the way out");

  runInstance("b", env, volumes.b);
  await waitHealthy(b);
  const viaB = await fetch(`${site("b")}/`);
  expect(viaB.status === 200 && HOME_H1.test(await viaB.text()), "instance b serves the site");
  step("a second instance with the same settings serves the same site");

  const codes: number[] = [];
  let polling = true;
  const poll = (async () => {
    while (polling) {
      const r = await fetch(`${studio("b")}/api/health`).catch(() => undefined);
      codes.push(r?.status ?? 0);
      await r?.body?.cancel();
      await sleep(200);
    }
  })();
  docker(["stop", "-t", "15", a]);
  await sleep(3000);
  polling = false;
  await poll;
  const bad = codes.filter((c) => c !== 200);
  expect(bad.length === 0, "instance b answered every request while a stopped", { codes });
  const after = await fetch(`${site("b")}/`);
  expect(
    after.status === 200 && HOME_H1.test(await after.text()),
    "instance b serves the site after a stopped",
  );
  step(`instance a stopped (SIGTERM) and b answered all ${codes.length} requests meanwhile`);
  console.log("\nDocker smoke test passed.");
} catch (e) {
  console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}`);
  for (const name of [a, b, store]) {
    console.error(`--- ${name} logs ---`);
    spawnSync("docker", ["logs", "--tail", "120", name], { stdio: "inherit" });
  }
  process.exitCode = 1;
} finally {
  if (keep) console.log(`kept ${a}, ${b}, ${store} and the network ${net}`);
  else {
    for (const name of [a, b, store])
      spawnSync("docker", ["rm", "-f", "-v", name], { stdio: "ignore" });
    for (const v of Object.values(volumes))
      spawnSync("docker", ["volume", "rm", v], { stdio: "ignore" });
    spawnSync("docker", ["network", "rm", net], { stdio: "ignore" });
  }
  rmSync(envDir, { recursive: true, force: true });
}
