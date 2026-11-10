# Cloudhal in Docker

The official self-host image, `ghcr.io/cloudhal-dev/cloudhal`, built from each npm release (issue #143). The guide is [docs/guides/self-host.md](../../docs/guides/self-host.md); this folder holds what it refers to:

- `Dockerfile` — `node:24-bookworm-slim`, `@cloudhal/cli` installed with npm (`CLOUDHAL_VERSION`), the blog starter's dependencies next to it, non-root, `/data` volume, port 8787, a health check on `/api/health`. `install.mjs` is its build stage.
- `bin/entrypoint` — `cloudhal studio --init-if-empty` in `/data`, which runs `site-build --wait` at start and after every publish (`CLOUDHAL_SITE_BUILD=on`, #150; with a CLI from 0.7.1 or older the entrypoint runs the start-up build itself); `bin/site-build` — the public site as static HTML of the published snapshot (`cloudhal build --published`; before the first publish the not-published status page with a `.cloudhal-status` marker, which the `Caddyfile` answers with 503), built in a staging copy of the project and published at `/data/dist`, a symlink to the newest build under `/data/site` (swapped atomically, never a 404 — except for a moment on the first build after upgrading from 0.6.3, when the real folder moves aside to `/data/site/legacy-0.6.3`; the build before the current one is kept as `/data/site/previous`; `/data/site/current.json` records what is served, for Studio's overview; SIGTERM or SIGINT ends a build and removes its staging folder). Never run an Astro build (`cloudhal build`, `cloudhal deploy`) inside `/data` by hand: it empties the served build through the symlink.
- `compose.yml`, `.env.example`, `Caddyfile` — Studio alone, or with Caddy (profile `caddy`) serving Studio and the built site with automatic TLS.

Build it yourself from a release, or from this checkout's packages (`edge`):

```bash
docker build --build-arg CLOUDHAL_VERSION=0.6.4 -t cloudhal:local deploy/docker
```

```bash
node scripts/pack-packages.ts deploy/docker/tarballs && docker build -t cloudhal:local deploy/docker
```

A release whose CLI has no `cloudhal build --published` (0.7.1 or older) still builds with these scripts: `site-build` warns and builds the old way, and the smoke test skips its status-page checks.

`node scripts/docker-smoke.ts --image cloudhal:local` runs what CI runs after every build (`.github/workflows/docker.yml`); `--platform linux/arm64` runs the other architecture where Docker can.
