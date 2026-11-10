/**
 * What a self-hoster gets (docs/guides/self-host.md, #143): runs the image with an empty volume,
 * waits for its HEALTHCHECK, then — through the API, as Studio would — checks that the first owner
 * can sign up only with the setup token (#165), that Studio's page is served and that `/mcp`
 * refuses an anonymous call, lists the scaffolded site, builds the public site with `site-build`
 * before the first publish (RFC-0043's status page, which the compose file's Caddyfile — run in a
 * `caddy` container on the same volume — answers with 503 and `Retry-After`), publishes it, builds
 * it twice more (the site, which Caddy now answers with 200; the third build swaps the served tree
 * in place, #166) and reads the built home page. Run by .github/workflows/docker.yml after every
 * build, and by hand:
 *
 *   node scripts/docker-smoke.ts [--image <ref>] [--platform <os/arch>] [--port <n>]
 *                                [--site-port <n>] [--keep]
 */
import { execFileSync, spawnSync } from "node:child_process";
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
const sitePort = Number(arg("site-port") ?? port + 1);
const name = `cloudhal-smoke-${process.pid}`;
const caddyName = `${name}-caddy`;
const origin = `http://localhost:${port}`;
const siteOrigin = `http://127.0.0.1:${sitePort}`;
/** The compose file's Caddyfile and the Caddy it runs (compose.yml, the `caddy` profile). */
const CADDYFILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../deploy/docker/Caddyfile",
);
const CADDY_IMAGE = "caddy:2.11";
// #165: the first account needs the setup token; the container gets one so the test need not read
// the printed link from its logs.
const setupToken = `smoke-setup-token-${crypto.randomUUID()}`;
/** The built home page, as the starter renders the site name. */
const HOME_H1 = /<h1[^>]*>Smoke Site<\/h1>/;
/** The served path: a symlink to /data/site/current, the newest build (#166). */
const SITE = "/data/dist";

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
  options: { body?: unknown; cookie?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: unknown; res: Response }> {
  const res = await fetch(`${origin}${path}`, {
    method,
    headers: {
      origin,
      "content-type": "application/json",
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...options.headers,
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

/** Runs `site-build` in the container; returns the build `current` points at afterwards. */
function siteBuild(which: string): string {
  const r = spawnSync("docker", ["exec", name, "site-build"], { stdio: "inherit" });
  expect(r.status === 0, `site-build (${which}) exited ${r.status}`);
  const served = docker(["exec", name, "readlink", SITE]);
  expect(served === "site/current", `${SITE} links to site/current`, served);
  return docker(["exec", name, "readlink", "/data/site/current"]);
}

/**
 * Caddy with the compose file's Caddyfile, the installation's volume at /srv/cloudhal (read-only,
 * as compose.yml mounts it) and plain HTTP: `:8080` is the site, `:8081` the unused Studio host.
 */
async function startCaddy(): Promise<void> {
  const volume = docker([
    "inspect",
    "--format",
    '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}',
    name,
  ]);
  expect(volume !== "", "the container has a /data volume");
  docker([
    "run",
    "-d",
    "--name",
    caddyName,
    "-p",
    `127.0.0.1:${sitePort}:8080`,
    "-e",
    "CLOUDHAL_SITE_URL=:8080",
    "-e",
    "CLOUDHAL_BASE_URL=:8081",
    "-v",
    `${CADDYFILE}:/etc/caddy/Caddyfile:ro`,
    "-v",
    `${volume}:/srv/cloudhal:ro`,
    CADDY_IMAGE,
    "caddy",
    "run",
    "--config",
    "/etc/caddy/Caddyfile",
    "--adapter",
    "caddyfile",
  ]);
  for (let i = 0; i < 30; i++) {
    try {
      await fetch(`${siteOrigin}/robots.txt`);
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error("Caddy did not answer within 30 s");
}

/** A page of the public site as Caddy serves it. */
async function served(
  pathname: string,
): Promise<{ status: number; headers: Headers; body: string }> {
  const res = await fetch(`${siteOrigin}${pathname}`);
  return { status: res.status, headers: res.headers, body: await res.text() };
}

docker([
  "run",
  "-d",
  "--name",
  name,
  ...(platform ? ["--platform", platform] : []),
  "-p",
  `127.0.0.1:${port}:8787`,
  "-e",
  `CLOUDHAL_BASE_URL=${origin}`,
  "-e",
  "CLOUDHAL_SITE_NAME=Smoke Site",
  "-e",
  `CLOUDHAL_SETUP_TOKEN=${setupToken}`,
  image,
]);
try {
  await waitHealthy();
  step("the container is healthy");
  const health = await api("GET", "/api/health");
  expect(health.status === 200, "GET /api/health", health.body);
  expect((health.body as { ok?: boolean }).ok === true, "health says ok", health.body);
  step("/api/health answers { ok: true }");

  const owner = {
    name: "Smoke Owner",
    email: "owner@example.com",
    password: "smoke-test-password",
  };
  const squatter = await api("POST", "/api/auth/sign-up/email", { body: owner });
  expect(squatter.status === 403, "sign-up without the setup token is refused", squatter.body);
  const signUp = await api("POST", "/api/auth/sign-up/email", {
    body: owner,
    headers: { "x-cloudhal-setup-token": setupToken },
  });
  expect(signUp.status === 200, "sign-up of the first owner with the setup token", signUp.body);
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
  step("the first owner signed up with the setup token, not without it");

  // Studio's index.html (the SPA fallback), not an API 404 and not an empty page.
  const home = await fetch(`${origin}/`);
  const homeHtml = await home.text();
  expect(home.status === 200, "GET /", home.status);
  expect(
    (home.headers.get("content-type") ?? "").includes("text/html") &&
      homeHtml.includes("<title>Cloudhal Studio</title>"),
    "GET / is Studio's index.html",
    { type: home.headers.get("content-type"), start: homeHtml.slice(0, 120) },
  );
  step("GET / serves Studio");

  // The MCP endpoint is public but never anonymous (ADR-0011).
  const mcp = await api("POST", "/mcp", {
    body: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
  });
  expect(mcp.status === 401, "POST /mcp without credentials is refused with 401", mcp.status);
  step("POST /mcp without credentials answers 401");

  const sites = await api("GET", "/api/sites", { cookie });
  const site = (sites.body as { id: string; name: string }[])[0];
  if (site?.name !== "Smoke Site") expect(false, "the scaffolded site is listed", sites.body);
  if (!site) throw new Error("no site");
  // A volume from 0.6.3 has a real /data/dist folder: the first build moves it aside, keeps it as
  // site/previous, and puts the symlink in its place (#166).
  docker(["exec", name, "sh", "-c", "mkdir -p /data/dist && touch /data/dist/marker"]);
  // RFC-0043 §1.10: before the first publish the build is the status page and its marker, never
  // the drafts, and Caddy answers it with 503 and Retry-After (robots.txt keeps its 200).
  const first = siteBuild("before the first publish");
  const resolved = docker(["exec", name, "readlink", "-f", SITE]);
  expect(resolved.startsWith("/data/site/"), `${SITE} resolves under /data/site/`, resolved);
  const legacy = spawnSync("docker", ["exec", name, "test", "-e", "/data/site/previous/marker"]);
  expect(legacy.status === 0, "site/previous is the moved 0.6.3 folder, marker included");
  step("the first site-build moved a 0.6.3 /data/dist aside as site/previous");
  const marker = docker(["exec", name, "cat", `${SITE}/.cloudhal-status`]);
  expect(marker === "not-published", "the unpublished build has the not-published marker", marker);
  const statusHtml = docker(["exec", name, "cat", `${SITE}/index.html`]);
  expect(
    statusHtml.includes('data-state="not-published"') && !HOME_H1.test(statusHtml),
    "the unpublished build is the status page, not the site",
  );
  await startCaddy();
  const unpublished = await served("/");
  expect(
    unpublished.status === 503,
    "Caddy answers / with 503 before the first publish",
    unpublished.status,
  );
  expect(
    unpublished.headers.get("retry-after") === "3600",
    "Retry-After: 3600",
    unpublished.headers.get("retry-after"),
  );
  expect(
    unpublished.headers.get("cache-control") === "no-store",
    "Cache-Control: no-store",
    unpublished.headers.get("cache-control"),
  );
  expect(unpublished.headers.get("x-robots-tag") === "noindex", "X-Robots-Tag: noindex");
  expect(unpublished.body.includes('data-state="not-published"'), "the 503 is the status page");
  const deep = await served("/posts/hello-world");
  expect(deep.status === 503, "every page is the 503 before the first publish", deep.status);
  const robots = await served("/robots.txt");
  expect(
    robots.status === 200 && robots.body.includes("Disallow: /"),
    "robots.txt is 200 and disallows all",
    robots,
  );
  step("before the first publish Caddy serves the status page with 503 and Retry-After");

  const publish = await api("POST", `/api/sites/${site.id}/snapshots`, {
    cookie,
    body: { publish: true, label: "smoke" },
  });
  expect(publish.status === 200 || publish.status === 201, "publish", publish.body);
  step(`site ${site.id} published`);

  const second = siteBuild("after the publish");
  expect(second !== first, "the build after the publish is a new tree", { first, second });
  const noMarker = spawnSync("docker", ["exec", name, "test", "-e", `${SITE}/.cloudhal-status`]);
  expect(noMarker.status !== 0, "the published build has no status marker");
  expect(
    HOME_H1.test(docker(["exec", name, "cat", `${SITE}/index.html`])),
    "the built home page shows the site name",
  );
  const published = await served("/");
  expect(published.status === 200, "Caddy answers / with 200 after the publish", published.status);
  expect(HOME_H1.test(published.body), "Caddy serves the built home page");
  step(`site-build published the site, served with 200: ${SITE} -> site/current -> ${second}`);

  // A third build swaps the served tree in one rename and keeps the one before it, whose pages
  // may still load their assets (#166).
  const third = siteBuild("third");
  expect(third !== second, "the third build is a new tree", { second, third });
  const kept = docker([
    "exec",
    name,
    "sh",
    "-c",
    "ls -1 /data/site | grep -v -x -e current -e previous",
  ]);
  expect(
    kept === [second, third].sort().join("\n"),
    "the newest build and the one before it are kept",
    kept,
  );
  const previous = docker(["exec", name, "readlink", "/data/site/previous"]);
  expect(previous === second, "site/previous links to the build before", previous);
  expect(
    HOME_H1.test(docker(["exec", name, "cat", `${SITE}/index.html`])),
    "the home page is served after the swap",
  );
  expect((await served("/")).status === 200, "Caddy still answers / with 200 after the swap");
  step("a third site-build swapped the served tree and kept the previous one");
  console.log("\nDocker smoke test passed.");
} catch (e) {
  console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}\n--- container logs ---`);
  spawnSync("docker", ["logs", "--tail", "200", name], { stdio: "inherit" });
  console.error("--- caddy logs ---");
  spawnSync("docker", ["logs", "--tail", "50", caddyName], { stdio: "inherit" });
  process.exitCode = 1;
} finally {
  if (keep) console.log(`kept containers ${name} and ${caddyName}`);
  else {
    // Caddy first: the volume goes with the Cloudhal container, and only once nothing uses it.
    spawnSync("docker", ["rm", "-f", caddyName], { stdio: "ignore" });
    spawnSync("docker", ["rm", "-f", "-v", name], { stdio: "ignore" });
  }
}
