# Cloudhal in Docker

The official self-host image, `ghcr.io/cloudhal-dev/cloudhal`, built from each npm release (issue #143). The guide is [docs/guides/self-host.md](../../docs/guides/self-host.md); this folder holds what it refers to:

- `Dockerfile` — `node:24-bookworm-slim`, `@cloudhal/cli` installed with npm (`CLOUDHAL_VERSION`), the blog starter's dependencies next to it, non-root, `/data` volume, port 8787, a health check on `/api/health`. `install.mjs` is its build stage.
- `bin/entrypoint` — `cloudhal studio --init-if-empty` in `/data`; `bin/site-build` — the public site as static HTML, published under `/data/site` with the newest build at `/data/site/current` (swapped in atomically, the previous build kept until then).
- `compose.yml`, `.env.example`, `Caddyfile` — Studio alone, or with Caddy (profile `caddy`) serving Studio and the built site with automatic TLS.

Build it yourself from a release, or from this checkout's packages (`edge`):

```bash
docker build --build-arg CLOUDHAL_VERSION=0.6.3 -t cloudhal:local deploy/docker
```

```bash
node scripts/pack-packages.ts deploy/docker/tarballs && docker build -t cloudhal:local deploy/docker
```

`node scripts/docker-smoke.ts --image cloudhal:local` runs what CI runs after every build (`.github/workflows/docker.yml`); `--platform linux/arm64` runs the other architecture where Docker can.
