# Self-host with Docker: a guide for operators

Cloudhal runs on your own server from one container: `ghcr.io/cloudhal-dev/cloudhal` holds the `cloudhal` CLI as npm publishes it, and `cloudhal studio` inside it serves the Studio UI, the REST API that Studio and the CLI use, and the MCP endpoint agents connect to. Everything the installation owns — the project (`cloudhal.json`, the starter theme), its SQLite database, media and the built site — lives on one volume mounted at `/data`. The image is built from each npm release, for `linux/amd64` and `linux/arm64`, by [`.github/workflows/docker.yml`](https://github.com/cloudhal-dev/cloudhal/blob/main/.github/workflows/docker.yml); its files are in [`deploy/docker/`](https://github.com/cloudhal-dev/cloudhal/tree/main/deploy/docker).

Cloudflare is still the deployment Cloudhal is built for ([quickstart](../start/quickstart.md), [one-click deploy](deploy-button.md)): there the site renders on demand from D1 and R2 and publishing needs no rebuild. Self-hosting is for people who want their data on their own machine; its site is static HTML that a web server serves (see [the public site](#the-public-site)).

## Requirements

- A server with Docker Engine 24 or later and the compose plugin (`docker compose`), 1 GB of memory, a few GB of disk.
- For Studio beyond `localhost`: a DNS name pointing at the server, and either the compose file's Caddy (ports 80 and 443 open; it fetches TLS certificates itself) or a reverse proxy of your own.

## Quick start

```bash
mkdir cloudhal && cd cloudhal
curl -fsSLO https://raw.githubusercontent.com/cloudhal-dev/cloudhal/main/deploy/docker/compose.yml
curl -fsSL https://raw.githubusercontent.com/cloudhal-dev/cloudhal/main/deploy/docker/.env.example -o .env
docker compose up -d
```

Open http://localhost:8787. The first start on the empty volume creates a project from the blog starter (`CLOUDHAL_INIT`, named after `CLOUDHAL_SITE_NAME`) and runs the migrations; the first account that signs up is the Owner, after which sign-up closes and everyone else joins by invite. Invites are links: Studio's Team page creates one, shows it once, and you pass it on yourself; a forgotten password is reset with a link an Administrator creates there. Nothing is mailed (see [limits](#limits)).

Agents connect to the MCP endpoint at `<base URL>/mcp` with an agent key made in Studio, as for a Cloudflare deployment ([connect an agent](../agents/clients.md)).

## Beyond localhost: a public origin

Studio's sign-in cookies and the API's origin checks are tied to the URL browsers use, so `CLOUDHAL_BASE_URL` must be exactly the origin Studio is opened at whenever that is not `http://localhost:8787` — another port on this machine (`CLOUDHAL_PORT=9000` goes with `CLOUDHAL_BASE_URL=http://localhost:9000`) as much as a DNS name. With it wrong, Studio loads but sign-up and sign-in answer 403.

| Variable | What it does |
| --- | --- |
| `CLOUDHAL_BASE_URL` | The origin browsers open Studio at, e.g. `https://studio.example.com`: Better Auth's base URL (its cookies become `Secure` on https), a trusted origin for the API, and the URL the log prints. Origin only, no path. |
| `CLOUDHAL_BEHIND_PROXY` | `1` when a reverse proxy terminates TLS in front of the container: each request's scheme and host are then taken from the proxy's `X-Forwarded-Proto` / `X-Forwarded-Host`. Set it only when the proxy is the only way in, since the headers are then trusted. |
| `CLOUDHAL_HOST` | The address the server binds inside the container; the image sets `0.0.0.0`. |

With the compose file's **`caddy` profile** both are handled for you: set `CLOUDHAL_BASE_URL` (Studio) and `CLOUDHAL_SITE_URL` (the public site) in `.env`, both `https://` origins, `CLOUDHAL_BEHIND_PROXY=1`, keep `CLOUDHAL_BIND=127.0.0.1`, point both names at the server and run

```bash
docker compose --profile caddy up -d
```

Caddy obtains and renews certificates for both hosts, proxies the Studio host to the container with the forwarded headers, and serves the built site for the site host. Without the profile the two variables are not needed; with it, Caddy refuses to start while either is empty and says so in `docker compose logs caddy`.

With a **reverse proxy of your own** (nginx, Traefik, a cloud load balancer): proxy the Studio host to port 8787, pass `X-Forwarded-Proto` and `X-Forwarded-Host`, set `CLOUDHAL_BASE_URL` and `CLOUDHAL_BEHIND_PROXY=1`, and serve `/data/site/current` from the volume for the site host (a symlink to the newest build, which the server must follow; nginx and Caddy do by default).

## Environment

All of these are read by `cloudhal studio` in the container, except those marked *compose*, which the compose file reads (`.env.example` lists them with their defaults):

| Variable | Default | Meaning |
| --- | --- | --- |
| `CLOUDHAL_TAG` (compose) | `latest` | The image tag; see [upgrades](#upgrades). |
| `CLOUDHAL_VOLUME` (compose) | `cloudhal-data` | The name of the volume that holds the installation; see [backup and restore](#backup-and-restore). A second Cloudhal stack on the same host needs a name of its own (and its own `CLOUDHAL_PORT` and `CLOUDHAL_BASE_URL`): two containers on one volume are not supported. |
| `CLOUDHAL_BASE_URL` | `http://localhost:8787` | The origin browsers open Studio at, as above. |
| `CLOUDHAL_BEHIND_PROXY` | `0` | Trust `X-Forwarded-*`. |
| `CLOUDHAL_BIND`, `CLOUDHAL_PORT` (compose) | `127.0.0.1`, `8787` | Which address and port of the host publish the container's port 8787. A new port goes into `CLOUDHAL_BASE_URL` too. |
| `CLOUDHAL_SITE_URL` | empty | The public site's `https://` origin: Caddy serves the site there (caddy profile), and `site-build` makes its host the site's domain ([the site's origin](#the-public-site)). |
| `CLOUDHAL_INIT` | `blog` | The starter a first start on an empty volume scaffolds. |
| `CLOUDHAL_SITE_NAME` | `My site` | The name of that first site. |
| `CLOUDHAL_AUTOMATIONS` | `on` | `off` stops scheduled automations; releases and gates go on ([schedules](schedules.md)). |
| `CLOUDHAL_TRUSTED_ORIGINS` | empty | Extra origins the API accepts browser requests from, comma-separated. |
| `BETTER_AUTH_SECRET` | created on the volume | Better Auth's secret. Unset, the container creates one at first start and keeps it at `/data/.cloudhal/auth-secret`; set it only to supply your own, and never empty. |
| `CLOUDHAL_AI_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | empty | Workers AI over REST for Build chat (both or neither). The token is kept in the container's memory, never written to the volume. |

**Secrets.** `CLOUDHAL_AI_TOKEN` and `BETTER_AUTH_SECRET` are secrets, and `.env` holds them once they are set: keep the file private (`chmod 600 .env`) and out of version control. The compose file passes each of them to the container only when it is set, so if the compose folder is a checkout, put the secrets in a second file outside it and name both files in `COMPOSE_ENV_FILES` for every `docker compose` command — in the shell profile and in the cron line's environment:

```bash
export COMPOSE_ENV_FILES=.env,/etc/cloudhal/secrets.env
```

A one-off `docker compose --env-file … up -d` is not enough: the next command without the flags (an upgrade, the cron line) recreates the container without the secrets, which signs everyone out when `BETTER_AUTH_SECRET` was yours and turns Build chat off.

## The public site

`cloudhal studio` serves Studio and the API, not the site. The site is `cloudhal build` output: static HTML of the published snapshot — or of the latest snapshot before the first publish (a build that renders a status page instead until then is RFC-0043's `cloudhal build --published`, not in this version). The image builds and publishes it with

```bash
docker compose exec cloudhal site-build
```

and Caddy (or your web server) serves `/data/site/current` from the volume. `site-build` renders into `/data/dist`, then moves the finished tree to `/data/site/<build id>` and points the `current` symlink at it with one rename: visitors see the previous build until the new one is complete, never a 404 or a half-written page, and a failed build changes nothing. The build before the current one is kept, so a page a visitor opened from it can still load its scripts and media; older builds are removed. Run it after each publish; a cron line on the host (`*/15 * * * * docker compose -f /path/to/compose.yml exec -T cloudhal site-build`) keeps the site at most that far behind. Drafts and scheduled releases show in Studio at once (the editor previews drafts); the public pages change when the next build runs. Signed preview links to unpublished content on the public site belong to the Cloudflare deployment; the container has no preview secret. Rebuilding on publish from inside the container is a follow-up issue; serving the site live from the snapshot, as the Cloudflare deployment does, is an RFC of its own.

**The site's origin.** Canonical links, the sitemap, feeds and structured data need the public origin, which a static build cannot learn from a request. `cloudhal build` takes it from the site's primary domain, kept in `cloudhal.json` as `domains.site` and set with `cloudhal domain set <hostname>` (`docker compose exec cloudhal cloudhal domain set www.example.com`). `site-build` does this for you from `CLOUDHAL_SITE_URL`, an `https://` origin without a path or port, whenever it is set and differs (a name without a dot, such as `localhost`, or an IP address is skipped with a warning, and the build goes on). The domain then becomes the site's primary domain on the live site too, replacing one chosen in Studio. A published snapshot that already names a primary domain keeps it in that build: the new one reaches the pages with the next publish, and `site-build` says so. Without any domain the build's URLs say `localhost`.

**Headers and the 404 page.** The build writes a `_headers` file — the security headers the Cloudflare deployment sends, and a cache rule for `/media/*` when the site has media — for hosts that read it, such as Cloudflare. Caddy does not: the compose file's Caddyfile marks `/media/*`, `/_astro/*` and `/_cloudhal/*` immutable on its own (files named by content hash, and only when the file exists, so a miss is never cached), and the security headers can be copied from `/data/site/current/_headers` into it. A miss is answered with `/404.html`, which exists only when the site has a page at `/404` (the starter ships none); until then it is the web server's plain 404.

The project's dependencies for the build (Astro, the renderer, Tailwind) are the image's own `node_modules`, linked into the project on the first `site-build`: no install, no network, and an image upgrade upgrades them.

## Upgrades

The image carries the same version as the npm packages: `0.6.3` is `@cloudhal/cli@0.6.3`. Tags: `X.Y.Z`, `X.Y` (the newest patch of a minor), `latest` (the newest release) and `edge` (nightly from `main`, for trying what is coming; never for a site you care about). A tag moves only after the release's image has passed the smoke test on both architectures and a vulnerability scan. `latest` follows patch releases; **pin the minor in production** (`CLOUDHAL_TAG=0.6`), since in 0.x a minor bump is a breaking change ([releasing](https://github.com/cloudhal-dev/cloudhal/blob/main/CONTRIBUTING.md#releasing)).

```bash
docker compose pull && docker compose up -d
```

Database migrations run when the container starts, as they do on every `cloudhal studio` start. Going back to an older image over a newer database is not supported: take a backup first.

**From the compose files of 0.6.3.** Two things moved in `compose.yml` and the `Caddyfile` ([issue #166](https://github.com/cloudhal-dev/cloudhal/issues/166)): the volume is now named `cloudhal-data` outright, where the earlier file left the name to compose (`<project>_cloudhal-data`), and Caddy serves `/data/site/current` instead of `/data/dist`. The new files need an image whose `site-build` publishes `/data/site/current`: 0.6.4 and later, and the 0.6.3 image as rebuilt with this change (`docker compose run --rm cloudhal grep -c site/current /opt/cloudhal/bin/site-build` prints a number above 0). After replacing the files, set `CLOUDHAL_VOLUME=<project>_cloudhal-data` in `.env` to keep your volume (see [backup and restore](#backup-and-restore); without it `docker compose up` creates an empty `cloudhal-data` and starts a fresh site next to your data), then, in this order

```bash
docker compose pull
```

```bash
docker compose up -d cloudhal
```

```bash
docker compose exec cloudhal site-build
```

```bash
docker compose --profile caddy up -d
```

so that `current` exists before the new Caddyfile looks for it (Caddy keeps serving the old `/data/dist` until then; `site-build` moves it away, so run the last step right after it). A `.env` from 0.6.3 also sets `CLOUDHAL_SITE_URL` to the placeholder `https://www.example.com`: replace it with the site's origin, or leave it empty (`site-build` refuses to make an example domain the site's).

## Backup and restore

The volume is the installation. The compose file names it `cloudhal-data`, as the Dockerfile's `docker run -v cloudhal-data:/data` example does, so one set of commands serves both; `docker volume ls` shows the volumes you have. A stack created with the compose file of 0.6.3 has `<project>_cloudhal-data` instead (`cloudhal_cloudhal-data` after the quick start's `mkdir cloudhal`): set `CLOUDHAL_VOLUME` to that name in `.env` and use it in place of `cloudhal-data` below. Stop the container first, so that SQLite's write-ahead log is folded into the database file:

```bash
docker compose stop cloudhal
```

```bash
docker run --rm -v cloudhal-data:/data -v "$PWD":/backup alpine tar czf /backup/cloudhal-data.tgz -C /data .
```

```bash
docker compose start cloudhal
```

`docker run -v <name>:/data` creates an empty volume of that name when none exists, so a wrong name archives nothing and exits 0: look inside the archive (`tar tzf cloudhal-data.tgz | head`) before relying on it. To restore, check the archive, stop the stack, and unpack into a volume that is really empty — `docker volume create` on a name that exists does nothing and exits 0, and unpacking over a live installation leaves newer files (SQLite's `data.db-wal` among them) next to the restored ones:

```bash
tar tzf cloudhal-data.tgz | head
```

```bash
docker compose down
```

```bash
docker volume rm cloudhal-data
```

```bash
docker volume create cloudhal-data
```

```bash
docker run --rm -v cloudhal-data:/data -v "$PWD":/backup alpine tar xzf /backup/cloudhal-data.tgz -C /data
```

```bash
docker compose up -d
```

To keep the current volume as it is, unpack into a new one instead (`docker volume create cloudhal-data-restored`, the same `tar xzf` with that name) and set `CLOUDHAL_VOLUME=cloudhal-data-restored` in `.env` before `docker compose up -d`.

For one site rather than the installation, `cloudhal export` writes a portable `.cloudhal` archive of its graph, snapshots and media (never accounts, comments or secrets) and `cloudhal import` reads it back ([site archives](site-archives.md)):

```bash
docker compose exec cloudhal cloudhal export --out /data/backup.cloudhal
```

```bash
docker compose cp cloudhal:/data/backup.cloudhal .
```

## Health

`GET /api/health` answers `{ "ok": true }` without signing in, once the database is open and migrated; the image's `HEALTHCHECK` asks it every 30 s (`docker compose ps` shows `healthy`). The scheduler's state is at `GET /api/scheduler` for signed-in people and in `cloudhal schedules status`.

## Limits

- **Mail.** There is no mail sender in the container: invites and password resets are links made on Studio's Team page and passed on by hand. With `mail` in `cloudhal.json` (`"mail": { "from": "studio@example.com" }`) the container prints every mail it would send to its logs instead (`docker compose logs cloudhal`) and Studio offers delivery by email too — good for trying the flows, not for people who expect mail. An SMTP sender is a follow-up.
- **`render_page`** (the agents' screenshot tool) needs Chrome, which the image does not carry: the tool reports itself unavailable. A `-chrome` variant is a possible follow-up.
- **One process.** `cloudhal studio` runs the scheduler's tick, the comments job and analytics rollups itself, on the project's SQLite file; several containers on one volume are not supported.
- **The site is static** between builds, as above.
- **Deploying to Cloudflare** from the container is not set up (the Cloudflare adapter is not installed); use the CLI on your machine for that.

## Building the image yourself

```bash
docker build --build-arg CLOUDHAL_VERSION=0.6.3 -t cloudhal:local deploy/docker
```

builds a release version from npm; `node scripts/pack-packages.ts deploy/docker/tarballs` followed by the same build without the argument builds `edge` from a checkout. `node scripts/docker-smoke.ts --image cloudhal:local` runs what CI runs: an empty volume, the health check, Studio's page, an anonymous `/mcp` call, the first owner through the API, a publish and `site-build` twice (the second build swaps the served tree). `--platform linux/arm64` runs the other architecture's image where Docker can (Apple silicon, or QEMU).
