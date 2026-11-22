# Cloudhal in Docker

The official self-host image, `ghcr.io/cloudhal-dev/cloudhal`, built from each release ([RFC-0047](../../docs/rfcs/0047-self-host-on-workerd.md)). It runs the release bundle's site and admin Workers on a pinned workerd, as a cluster instance whose state lives in an S3 store. The guide is [docs/guides/self-host.md](../../docs/guides/self-host.md); this folder holds what it refers to:

- **`Dockerfile`:** `node:24-bookworm-slim`, with `@cloudhal/cli` and workerd (`workerd-version`) installed by `install.mjs`.
  - The release bundle lives under `/opt/cloudhal/bundle`. For a release it is downloaded and verified by `cloudhal selfhost fetch`; for edge it comes from `bundle/` (scripts/selfhost-edge-bundle.ts).
  - Runs as non-root with a read-only root, and `/data` and `/tmp` are the only writable paths.
  - Ports 8787 (Studio, the API, `/mcp`), 8788 (the site) and 7000 (the cluster).
- **`bin/entrypoint`:** `cloudhal selfhost start` by default; `secrets`, `config` and `check` are `cloudhal selfhost` commands. `start` does these steps:
  1. reads the settings (`_FILE` secrets too);
  2. refuses a volume of the Node image;
  3. checks the bundle;
  4. writes the workerd config and runs workerd, passing one SIGTERM on;
  5. creates the site under `CLOUDHAL_SITE_ID`.
- **`compose.yml`, `.env.example`, `Caddyfile`:** Cloudhal with SeaweedFS and a one-shot that creates the bucket. With the `caddy` profile, Caddy proxies both hosts with TLS and sets `CF-Connecting-IP`.

Build a release:

```bash
docker build --build-arg CLOUDHAL_VERSION=0.11.0 -t cloudhal:local deploy/docker
```

Build this checkout (edge):

```bash
node scripts/pack-packages.ts deploy/docker/tarballs && pnpm --filter @cloudhal/studio build && node scripts/selfhost-edge-bundle.ts deploy/docker/bundle --no-build && docker build -t cloudhal:local deploy/docker
```

`node scripts/docker-smoke.ts --image cloudhal:local` runs what CI runs after every build (`.github/workflows/docker.yml`); `--platform linux/arm64` runs the other architecture where Docker can.
