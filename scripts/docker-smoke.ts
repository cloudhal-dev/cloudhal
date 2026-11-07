/**
 * What a self-hoster gets (docs/guides/self-host.md, #143): runs the image with an empty volume,
 * waits for its HEALTHCHECK, then — through the API, as Studio would — creates the first owner,
 * lists the scaffolded site, publishes it, builds the public site with `site-build` and reads the
 * built home page. Run by .github/workflows/docker.yml after every build, and by hand:
 *
 *   node scripts/docker-smoke.ts [--image <ref>] [--port <n>] [--keep]
 */
import { execFileSync, spawnSync } from "node:child_process";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const image = arg("image") ?? "cloudhal:local";
const port = Number(arg("port") ?? 18787);
const keep = process.argv.includes("--keep");
const name = `cloudhal-smoke-${process.pid}`;
const origin = `http://localhost:${port}`;

const docker = (args: string[], input?: string): string =>
  execFileSync("docker", args, { encoding: "utf8", ...(input ? { input } : {}) }).trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const step = (text: string) => console.log(`✓ ${text}`);

async function waitHealthy(): Promise<void> {
  for (let i = 0; i < 90; i++) {
    const status = docker(["inspect", "--format", "{{.State.Health.Status}}", name]);
    if (status === "healthy") return;
    if (docker(["inspect", "--format", "{{.State.Running}}", name]) !== "true")
      throw new Error("the container stopped");
    await sleep(2000);
  }
  throw new Error("the container did not become healthy within 180 s");
}

async function api(
  method: string,
  path: string,
  options: { body?: unknown; cookie?: string } = {},
): Promise<{ status: number; body: unknown; res: Response }> {
  const res = await fetch(`${origin}${path}`, {
    method,
    headers: {
      origin,
      "content-type": "application/json",
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, body, res };
}

function expect(ok: boolean, what: string, detail?: unknown): void {
  if (!ok) throw new Error(`${what}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`);
}

docker([
  "run",
  "-d",
  "--name",
  name,
  "-p",
  `127.0.0.1:${port}:8787`,
  "-e",
  `CLOUDHAL_BASE_URL=${origin}`,
  "-e",
  "CLOUDHAL_SITE_NAME=Smoke Site",
  image,
]);
try {
  await waitHealthy();
  step("the container is healthy");
  const health = await api("GET", "/api/health");
  expect(health.status === 200, "GET /api/health", health.body);
  expect((health.body as { ok?: boolean }).ok === true, "health says ok", health.body);
  step("/api/health answers { ok: true }");

  const signUp = await api("POST", "/api/auth/sign-up/email", {
    body: { name: "Smoke Owner", email: "owner@example.com", password: "smoke-test-password" },
  });
  expect(signUp.status === 200, "sign-up of the first owner", signUp.body);
  const cookie = signUp.res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0] as string)
    .find((c) => c.includes("better-auth.session_token="));
  if (cookie === undefined) throw new Error("sign-up set no session cookie");
  const me = await api("GET", "/api/me", { cookie });
  expect(
    (me.body as { role?: string }).role === "owner",
    "the first account is the Owner",
    me.body,
  );
  step("the first owner signed up through the API");

  const sites = await api("GET", "/api/sites", { cookie });
  const site = (sites.body as { id: string; name: string }[])[0];
  if (site?.name !== "Smoke Site") expect(false, "the scaffolded site is listed", sites.body);
  if (!site) throw new Error("no site");
  const publish = await api("POST", `/api/sites/${site.id}/snapshots`, {
    cookie,
    body: { publish: true, label: "smoke" },
  });
  expect(publish.status === 200 || publish.status === 201, "publish", publish.body);
  step(`site ${site.id} published`);

  spawnSync("docker", ["exec", name, "site-build"], { stdio: "inherit" });
  const html = docker(["exec", name, "cat", "/data/dist/index.html"]);
  expect(/<h1[^>]*>Smoke Site<\/h1>/.test(html), "the built home page shows the site name");
  step("site-build wrote the public site to /data/dist");
  console.log("\nDocker smoke test passed.");
} catch (e) {
  console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}\n--- container logs ---`);
  spawnSync("docker", ["logs", "--tail", "200", name], { stdio: "inherit" });
  process.exitCode = 1;
} finally {
  if (keep) console.log(`kept container ${name}`);
  else spawnSync("docker", ["rm", "-f", "-v", name], { stdio: "ignore" });
}
