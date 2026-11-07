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

Open http://localhost:8787. The first start on the empty volume creates a project from the blog starter (`CLOUDHAL_INIT`, named after `CLOUDHAL_SITE_NAME`) and runs the migrations; the first account that signs up is the Owner, after which sign-up closes and everyone else joins by invite. Invites and password-reset links are printed to the container's logs (`docker compose logs cloudhal`), not sent: mail is a follow-up for self-hosting.

Agents connect to the MCP endpoint at `<base URL>/mcp` with an agent key made in Studio, as for a Cloudflare deployment ([connect an agent](../agents/clients.md)).

## Beyond localhost: a public origin

Studio's sign-in cookies and the API's origin checks are tied to the URL browsers use, so once Studio is reached through a DNS name, tell the container:

| Variable | What it does |
| --- | --- |
| `CLOUDHAL_BASE_URL` | The public origin, e.g. `https://studio.example.com`: Better Auth's base URL (its cookies become `Secure`), a trusted origin for the API, and the URL the log prints. Origin only, no path. |
| `CLOUDHAL_BEHIND_PROXY` | `1` when a reverse proxy terminates TLS in front of the container: each request's scheme and host are then taken from the proxy's `X-Forwarded-Proto` / `X-Forwarded-Host`. Set it only when the proxy is the only way in, since the headers are then trusted. |
| `CLOUDHAL_HOST` | The address the server binds inside the container; the image sets `0.0.0.0`. |

With the compose file's **`caddy` profile** both are handled for you: set `CLOUDHAL_BASE_URL` (Studio) and `CLOUDHAL_SITE_URL` (the public site) in `.env`, `CLOUDHAL_BEHIND_PROXY=1`, keep `CLOUDHAL_BIND=127.0.0.1`, point both names at the server and run

```bash
docker compose --profile caddy up -d
```

Caddy obtains and renews certificates for both hosts, proxies the Studio host to the container with the forwarded headers, and serves the built site for the site host.

With a **reverse proxy of your own** (nginx, Traefik, a cloud load balancer): proxy the Studio host to port 8787, pass `X-Forwarded-Proto` and `X-Forwarded-Host`, set `CLOUDHAL_BASE_URL` and `CLOUDHAL_BEHIND_PROXY=1`, and serve `/data/dist` from the volume for the site host.

## Environment

All of these are read by `cloudhal studio` in the container (`.env.example` lists them with their defaults):

| Variable | Default | Meaning |
| --- | --- | --- |
| `CLOUDHAL_TAG` (compose) | `latest` | The image tag; see [upgrades](#upgrades). |
| `CLOUDHAL_BASE_URL` | `http://localhost:8787` | The public origin, as above. |
| `CLOUDHAL_BEHIND_PROXY` | `0` | Trust `X-Forwarded-*`. |
| `CLOUDHAL_BIND`, `CLOUDHAL_PORT` (compose) | `127.0.0.1`, `8787` | Which address and port of the host publish the container's port 8787. |
| `CLOUDHAL_SITE_URL` (caddy profile) | — | The public site's origin, served by Caddy. |
| `CLOUDHAL_INIT` | `blog` | The starter a first start on an empty volume scaffolds. |
| `CLOUDHAL_SITE_NAME` | `My site` | The name of that first site. |
| `CLOUDHAL_AUTOMATIONS` | `on` | `off` stops scheduled automations; releases and gates go on ([schedules](schedules.md)). |
| `CLOUDHAL_TRUSTED_ORIGINS` | empty | Extra origins the API accepts browser requests from, comma-separated. |
| `CLOUDHAL_AI_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | empty | Workers AI over REST for Build chat (both or neither); the token is never stored. |

Better Auth's secret is created on the volume at first start (`/data/.cloudhal/auth-secret`); set `BETTER_AUTH_SECRET` to supply your own.

## The public site

`cloudhal studio` serves Studio and the API, not the site. The site is `cloudhal build` output, static HTML of the published snapshot, which the image writes to `/data/dist` with

```bash
docker compose exec cloudhal site-build
```

and Caddy (or your web server) serves from the volume. Run it after each publish; a cron line on the host (`*/15 * * * * docker compose -f /path/to/compose.yml exec -T cloudhal site-build`) keeps the site at most that far behind. Drafts, previews and scheduled releases are visible in Studio at once; the public pages change when the next build runs. Rebuilding on publish from inside the container is a follow-up issue; serving the site live from the snapshot, as the Cloudflare deployment does, is an RFC of its own.

The project's dependencies for the build (Astro, the renderer, Tailwind) are the image's own `node_modules`, linked into the project on the first `site-build`: no install, no network, and an image upgrade upgrades them.

## Upgrades

The image carries the same version as the npm packages: `0.6.3` is `@cloudhal/cli@0.6.3`. Tags: `X.Y.Z`, `X.Y` (the newest patch of a minor), `latest` (the newest release) and `edge` (nightly from `main`, for trying what is coming; never for a site you care about). `latest` follows patch releases; **pin the minor in production** (`CLOUDHAL_TAG=0.6`), since in 0.x a minor bump is a breaking change ([releasing](https://github.com/cloudhal-dev/cloudhal/blob/main/CONTRIBUTING.md#releasing)).

```bash
docker compose pull && docker compose up -d
```

Database migrations run when the container starts, as they do on every `cloudhal studio` start. Going back to an older image over a newer database is not supported: take a backup first.

## Backup and restore

The volume is the installation: stop the container and copy it (`docker run --rm -v cloudhal-data:/data -v "$PWD":/backup alpine tar czf /backup/cloudhal-data.tgz -C /data .`), or restore the same way into an empty volume. For one site rather than the installation, `cloudhal export` writes a portable `.cloudhal` archive of its graph, snapshots and media (never accounts, comments or secrets) and `cloudhal import` reads it back ([site archives](site-archives.md)):

```bash
docker compose exec cloudhal cloudhal export --out /data/backup.cloudhal
```

```bash
docker compose cp cloudhal:/data/backup.cloudhal .
```

## Health

`GET /api/health` answers `{ "ok": true }` without signing in, once the database is open and migrated; the image's `HEALTHCHECK` asks it every 30 s (`docker compose ps` shows `healthy`). The scheduler's state is at `GET /api/scheduler` for signed-in people and in `cloudhal schedules status`.

## Limits

- **Mail** is printed to the logs; there is no SMTP sender yet.
- **`render_page`** (the agents' screenshot tool) needs Chrome, which the image does not carry: the tool reports itself unavailable. A `-chrome` variant is a possible follow-up.
- **One process.** `cloudhal studio` runs the scheduler's tick, the comments job and analytics rollups itself, on the project's SQLite file; several containers on one volume are not supported.
- **The site is static** between builds, as above.
- **Deploying to Cloudflare** from the container is not set up (the Cloudflare adapter is not installed); use the CLI on your machine for that.

## Building the image yourself

```bash
docker build --build-arg CLOUDHAL_VERSION=0.6.3 -t cloudhal:local deploy/docker
```

builds a release version from npm; `node scripts/pack-packages.ts deploy/docker/tarballs` followed by the same build without the argument builds `edge` from a checkout. `node scripts/docker-smoke.ts --image cloudhal:local` runs what CI runs: an empty volume, the health check, the first owner through the API, a publish and `site-build`.
