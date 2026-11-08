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

Studio answers at http://localhost:8787. The first start on the empty volume creates a project from the blog starter (`CLOUDHAL_INIT`, named after `CLOUDHAL_SITE_NAME`) and runs the migrations. It also prints a one-time setup link to the container's logs (`docker compose logs cloudhal`), `http://localhost:8787/login#setup=<token>`. Open it to create the Owner account. Without it sign-up is refused, so nobody who reaches the port first can claim the installation. After that sign-up closes and everyone else joins by invite. To choose the token yourself (for example from a secrets manager), set `CLOUDHAL_SETUP_TOKEN` to a random value of 32 characters or more, using only letters, digits and `- . _ ~` (`openssl rand -hex 32`). The log then shows the link with `<CLOUDHAL_SETUP_TOKEN>` in place of the value. Invites are links: Studio's Team page creates one, shows it once, and you pass it on yourself; a forgotten password is reset with a link an Administrator creates there. Nothing is mailed (see [limits](#limits)).

Agents connect to the MCP endpoint at `<base URL>/mcp` with an agent key made in Studio, as for a Cloudflare deployment ([connect an agent](../agents/clients.md)).

## Beyond localhost: a public origin

Studio's sign-in cookies and the API's origin checks are tied to the URL browsers use. Out of the box `CLOUDHAL_BASE_URL` is empty: sign-in accepts whatever address the browser used, and the log prints a one-line warning naming `--base-url`. Once Studio has a fixed address, set `CLOUDHAL_BASE_URL` to exactly that origin — a DNS name, or this machine on another port or a LAN address (`http://192.168.1.20:8787` with `CLOUDHAL_BIND=0.0.0.0`). It is then the only origin sign-in accepts and the origin of invite and password-reset links; with it wrong, Studio loads but sign-up and sign-in answer 403. Without it, the printed setup link names the container's own port 8787: with another `CLOUDHAL_PORT`, open it on that port. Behind a reverse proxy it is required: `cloudhal studio` refuses to start with `CLOUDHAL_BEHIND_PROXY=1` and no `CLOUDHAL_BASE_URL`, and the image refuses a `localhost` one there too (a `.env` kept from 0.6.3 sets `http://localhost:8787`).

| Variable | What it does |
| --- | --- |
| `CLOUDHAL_BASE_URL` | The origin browsers open Studio at, e.g. `https://studio.example.com`. Required behind a reverse proxy, and recommended whenever Studio is reached from another machine. It is Better Auth's base URL (its cookies become `Secure` for https), the only origin sign-in accepts besides `CLOUDHAL_TRUSTED_ORIGINS`, the origin of invite and password-reset links, and the URL the log prints. Without it, sign-in accepts whatever address the browser used, and the log warns. Origin only, no path. |
| `CLOUDHAL_BEHIND_PROXY` | `1` when a reverse proxy terminates TLS in front of the container: each request's scheme and host are then taken from the proxy's `X-Forwarded-Proto` / `X-Forwarded-Host`, and the client's address for rate limits from the last `X-Forwarded-For` hop. Requires `CLOUDHAL_BASE_URL`: Studio refuses to start without it. Set it only when the proxy is the only way in, since the headers are then trusted. |
| `CLOUDHAL_HOST` | The address the server binds inside the container; the image sets `0.0.0.0`. |

With the compose file's **`caddy` profile** both are handled for you: set `CLOUDHAL_BASE_URL` (Studio) and `CLOUDHAL_SITE_URL` (the public site) in `.env`, both `https://` origins, `CLOUDHAL_BEHIND_PROXY=1`, keep `CLOUDHAL_BIND=127.0.0.1`, point both names at the server, download the Caddyfile next to `compose.yml` (without it Docker creates an empty `./Caddyfile/` folder and Caddy cannot start) and run

```bash
curl -fsSLO https://raw.githubusercontent.com/cloudhal-dev/cloudhal/main/deploy/docker/Caddyfile
```

```bash
docker compose --profile caddy up -d
```

Caddy obtains and renews certificates for both hosts, proxies the Studio host to the container with the forwarded headers, and serves the built site for the site host. Without the profile the two variables are not needed; with it, Caddy refuses to start while either is empty and says so in `docker compose logs caddy`.

With a **reverse proxy of your own** (nginx, Traefik, a cloud load balancer): proxy the Studio host to port 8787, set `CLOUDHAL_BASE_URL` and `CLOUDHAL_BEHIND_PROXY=1`, and send `X-Forwarded-Proto`, `X-Forwarded-Host` and `X-Forwarded-For`. The proxy must overwrite or append `X-Forwarded-For` with the client's address, never pass on what the client sent: its last hop is the address rate limits count (Caddy does this by default). For nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    # Build chat streams server-sent events
    proxy_buffering off;
}
```

Serve `/data/dist` from the volume for the site host. It is the stable path: a real folder with the 0.6.3 image, and from 0.6.4 on a symlink to the newest build, which the server must follow (nginx and Caddy do by default). A build replaces the symlink atomically, so the server never sees it missing.

## Environment

All of these are read by `cloudhal studio` in the container, except those marked *compose*, which the compose file reads (`.env.example` lists them with their defaults):

| Variable | Default | Meaning |
| --- | --- | --- |
| `CLOUDHAL_TAG` (compose) | `latest` | The image tag; see [upgrades](#upgrades). |
| `CLOUDHAL_VOLUME` (compose) | `cloudhal-data` | The name of the volume that holds the installation; see [backup and restore](#backup-and-restore). A second Cloudhal stack on the same host needs a name of its own (and its own `CLOUDHAL_PORT` and `CLOUDHAL_BASE_URL`): two containers on one volume are not supported. |
| `CLOUDHAL_BASE_URL` | empty | The origin browsers open Studio at, as above. Required with `CLOUDHAL_BEHIND_PROXY=1`: Studio refuses to start without it. Empty: sign-in accepts any address the browser uses, and the log warns. |
| `CLOUDHAL_BEHIND_PROXY` | `0` | Trust `X-Forwarded-*`. Requires `CLOUDHAL_BASE_URL`; Studio refuses to start without it. |
| `CLOUDHAL_SETUP_TOKEN` | empty | The first owner's setup token. Empty: a token is generated at each start while there is no account, and printed to the logs. |
| `CLOUDHAL_BIND`, `CLOUDHAL_PORT` (compose) | `127.0.0.1`, `8787` | Which address and port of the host publish the container's port 8787. A new port goes into `CLOUDHAL_BASE_URL` too. |
| `CLOUDHAL_SITE_URL` | empty | The public site's `https://` origin: Caddy serves the site there (caddy profile), and `site-build` makes its host the site's domain ([the site's origin](#the-public-site)). |
| `CLOUDHAL_INIT` | `blog` | The starter a first start on an empty volume scaffolds. |
| `CLOUDHAL_SITE_NAME` | `My site` | The name of that first site. |
| `CLOUDHAL_AUTOMATIONS` | `on` | `off` stops scheduled automations; releases and gates go on ([schedules](schedules.md)). |
| `CLOUDHAL_TRUSTED_ORIGINS` | empty | Extra origins the API accepts browser requests from, comma-separated. |
| `BETTER_AUTH_SECRET` | created on the volume | Better Auth's secret. Unset, the container creates one at first start and keeps it at `/data/.cloudhal/auth-secret`; set it only to supply your own, and never empty. |
| `CLOUDHAL_AI_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | empty | Workers AI over REST for Build chat (both or neither). The token is kept in the container's memory, never written to the volume. |

**Secrets.** `CLOUDHAL_AI_TOKEN`, `BETTER_AUTH_SECRET` and `CLOUDHAL_SETUP_TOKEN` are secrets, and `.env` holds them once they are set: keep the file private (`chmod 600 .env`) and out of version control. The compose file passes each of them to the container only when it is set, so if the compose folder is a checkout, put the secrets in a second file outside it and name both files in `COMPOSE_ENV_FILES` for every `docker compose` command that creates or recreates the container (`up`, `pull && up`, `run`), for example in the shell profile. Give full paths: relative ones resolve against the current directory, not the compose folder.

```bash
export COMPOSE_ENV_FILES=/path/to/cloudhal/.env,/etc/cloudhal/secrets.env
```

A one-off `docker compose --env-file … up -d` is not enough: the next command without the flags (an upgrade) recreates the container without the secrets, which signs everyone out when `BETTER_AUTH_SECRET` was yours and turns Build chat off.

## The public site

`cloudhal studio` serves Studio and the API, not the site. The site is `cloudhal build` output: static HTML of the published snapshot — or of the latest snapshot before the first publish (a build that renders a status page instead until then is RFC-0043's `cloudhal build --published`, not in this version). The image builds and publishes it with

```bash
docker compose exec cloudhal site-build
```

and Caddy (or your web server) serves `/data/dist` from the volume. `cloudhal build` always writes the project's `dist` folder and empties it first, so `site-build` never runs it in `/data`: it copies the project's files to `/data/.site-build` (its `node_modules` and data folder linked, so the build reads the same database) and builds there. The finished build moves to `/data/site/<build id>`; then `/data/site/current`, `/data/site/previous` and `/data/dist` — symlinks to the newest build, the one before it, and `current` — are each replaced with one rename (`ln -sfn` and `mv -T`, which is atomic). Visitors see the previous build until the new one is complete, never a 404 or a half-written page, and a failed build changes nothing. The build before the current one is kept, and the compose file's Caddyfile serves a hashed asset (`/_astro/*`, `/_cloudhal/*`, `/media/*`) from it when the current build no longer has it, so a page opened before the swap still loads its scripts and media; older builds are removed. Do not run `cloudhal build` in `/data` by hand: it would write through the `dist` symlink and empty the served build. Run `site-build` after each publish; a cron line on the host (`*/15 * * * * cd /path/to/cloudhal && docker compose exec -T cloudhal site-build`) keeps the site at most that far behind (`exec` runs in the running container, so it needs no `COMPOSE_ENV_FILES`). Drafts and scheduled releases show in Studio at once (the editor previews drafts); the public pages change when the next build runs. Signed preview links to unpublished content on the public site belong to the Cloudflare deployment; the container has no preview secret. Rebuilding on publish from inside the container is a follow-up issue; serving the site live from the snapshot, as the Cloudflare deployment does, is an RFC of its own.

**The site's origin.** Canonical links, the sitemap, feeds and structured data need the public origin, which a static build cannot learn from a request. `cloudhal build` takes it from the site's primary domain, kept in `cloudhal.json` as `domains.site` and set with `cloudhal domain set <hostname>` (`docker compose exec cloudhal cloudhal domain set www.example.com`). `site-build` does this for you from `CLOUDHAL_SITE_URL`, an `https://` origin without a path or port, whenever it is set and differs (a name without a dot, such as `localhost`, or an IP address is skipped with a warning, and the build goes on). The domain then becomes the site's primary domain on the live site too, replacing one chosen in Studio. A published snapshot that already names a primary domain keeps it in that build: the new one reaches the pages with the next publish, and `site-build` says so. Without any domain the build's URLs say `localhost`.

**Headers and the 404 page.** The build writes a `_headers` file — the security headers the Cloudflare deployment sends, and a cache rule for `/media/*` when the site has media — for hosts that read it, such as Cloudflare. Caddy does not: the compose file's Caddyfile marks `/media/*`, `/_astro/*` and `/_cloudhal/*` immutable on its own (files named by content hash, and only when the file exists, so a miss is never cached), and the security headers can be copied from `/data/dist/_headers` into it. A miss is answered with `/404.html`, which exists only when the site has a page at `/404` (the starter ships none); until then it is the web server's plain 404.

The project's dependencies for the build (Astro, the renderer, Tailwind) are the image's own `node_modules`, linked into the project on the first `site-build`: no install, no network, and an image upgrade upgrades them.

## Upgrades

The image carries the same version as the npm packages: `0.6.4` is `@cloudhal/cli@0.6.4`. What this guide describes — the setup token, `site-build`'s layout under `/data/site` — needs 0.6.4 or later. Tags: `X.Y.Z`, `X.Y` (the newest patch of a minor), `latest` (the newest release) and `edge` (nightly from `main`, for trying what is coming; never for a site you care about). A tag moves only after the release's image has passed the smoke test on both architectures and a vulnerability scan. `latest` follows patch releases; **pin the minor in production** (`CLOUDHAL_TAG=0.6`), since in 0.x a minor bump is a breaking change ([releasing](https://github.com/cloudhal-dev/cloudhal/blob/main/CONTRIBUTING.md#releasing)).

```bash
docker compose pull && docker compose up -d
```

Database migrations run when the container starts, as they do on every `cloudhal studio` start. Going back to an older image over a newer database is not supported: take a backup first.

**From the compose files of 0.6.3.** The compose file now names the volume `cloudhal-data` outright, where the earlier file left the name to compose (`<project>_cloudhal-data`; [issue #166](https://github.com/cloudhal-dev/cloudhal/issues/166)). Before anything else, set `CLOUDHAL_VOLUME=<project>_cloudhal-data` in `.env` to keep your volume (see [backup and restore](#backup-and-restore)): without it `docker compose up` creates an empty `cloudhal-data` and starts a fresh site next to your data. Then download the new files next to `.env` (the Caddyfile only for the caddy profile) and pull:

```bash
curl -fsSLO https://raw.githubusercontent.com/cloudhal-dev/cloudhal/main/deploy/docker/compose.yml
```

```bash
curl -fsSLO https://raw.githubusercontent.com/cloudhal-dev/cloudhal/main/deploy/docker/Caddyfile
```

```bash
docker compose pull
```

The new files need the 0.6.4 image or later. Check the image you pulled before starting it; this form mounts no volume, so it cannot create an empty one (use your `CLOUDHAL_TAG`):

```bash
docker run --rm --entrypoint grep ghcr.io/cloudhal-dev/cloudhal:0.6 -c site/current /opt/cloudhal/bin/site-build
```

A number above 0 means the new `site-build`. Then start the stack as usual (`docker compose up -d`, or `docker compose --profile caddy up -d`).

The site stays at `/data/dist` throughout: the 0.6.3 `site-build` wrote a real folder there, and the first build of 0.6.4 moves it aside and puts the symlink in its place, so an old Caddyfile or an nginx root of `/data/dist` keeps working. A `.env` from 0.6.3 also sets `CLOUDHAL_SITE_URL` to the placeholder `https://www.example.com` — replace it with the site's origin, or leave it empty (`site-build` refuses to make an example domain the site's) — and `CLOUDHAL_BASE_URL=http://localhost:8787`, which the image refuses behind a proxy: set the public origin there.

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
- **`--no-auth`** is refused unless `--host` is loopback and `--behind-proxy` is off, so it cannot be used in the container, which binds `0.0.0.0`.
- **One process.** `cloudhal studio` runs the scheduler's tick, the comments job and analytics rollups itself, on the project's SQLite file; several containers on one volume are not supported.
- **The site is static** between builds, as above.
- **Deploying to Cloudflare** from the container is not set up (the Cloudflare adapter is not installed); use the CLI on your machine for that.

## Building the image yourself

```bash
docker build --build-arg CLOUDHAL_VERSION=0.6.4 -t cloudhal:local deploy/docker
```

builds a release version from npm (0.6.4 or later: the smoke test expects the setup token); `node scripts/pack-packages.ts deploy/docker/tarballs` followed by the same build without the argument builds `edge` from a checkout. `node scripts/docker-smoke.ts --image cloudhal:local` runs what CI runs: an empty volume, the health check, Studio's page, the first owner through the setup token (refused without it), Studio's page, an anonymous `/mcp` call, a publish and `site-build` twice (the second build swaps the served tree). `--platform linux/arm64` runs the other architecture's image where Docker can (Apple silicon, or QEMU).
