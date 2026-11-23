# Self-host with Docker: a guide for operators

Cloudhal runs on your own servers from one image, `ghcr.io/cloudhal-dev/cloudhal`. Inside it is the release's own code: the same site and admin Workers that run on Cloudflare, signed and checked file by file, on a pinned [workerd](https://github.com/cloudflare/workerd), Cloudflare's open-source Workers runtime ([RFC-0047](../rfcs/0047-self-host-on-workerd.md)). The admin Worker serves Studio, the REST API and the MCP endpoint agents connect to. The site Worker renders the published snapshot on each request, so a publish is live on the next request with no build, as on Cloudflare.

Every installation is a workerd cluster whose state lives in an S3-compatible bucket: the database (workerd's built-in D1), media, the scheduler and the cluster's own records. It can have one instance or several, all with the same settings. The compose file brings its own store, [SeaweedFS](https://github.com/seaweedfs/seaweedfs). The image is built for `linux/amd64` and `linux/arm64` from each release by [`.github/workflows/docker.yml`](https://github.com/cloudhal-dev/cloudhal/blob/main/.github/workflows/docker.yml); its files are in [`deploy/docker/`](https://github.com/cloudhal-dev/cloudhal/tree/main/deploy/docker).

Cloudflare is still the deployment Cloudhal is built for ([quickstart](../start/quickstart.md), [one-click deploy](deploy-button.md)). Self-hosting runs the same code on machines you choose.

## Requirements

- A server with Docker Engine 24 or later and the compose plugin (`docker compose`), 2 GB of memory and a few GB of disk.
- For Studio and the site beyond `localhost`: DNS names pointing at the server, and either the compose file's Caddy (ports 80 and 443 open; it fetches TLS certificates itself) or a reverse proxy of your own.

## Platforms

The image is built for `linux/amd64` and `linux/arm64`; Docker pulls the right one. It runs wherever a Linux container engine runs it: Docker Engine, Docker Desktop on macOS and Windows (whose Linux VM runs the container), Podman, containerd, k3s and other Kubernetes distributions. Each version is about 135 MB to download and 410 MB on disk. A cluster of one with its SeaweedFS uses about 300–400 MB of memory.

| Machine | Status |
| --- | --- |
| x86-64 servers, PCs, NAS boxes and VMs | Supported on any CPU with x86-64-v2 (SSE4.2, POPCNT), which covers Intel and AMD since about 2009 and Atom/Celeron since Silvermont (2013). AVX is not needed. A VM's CPU model must expose v2: in Proxmox or QEMU use `host` or `x86-64-v2-AES`, not the old `kvm64`, which starts workerd with an "illegal instruction" (the image says so). |
| arm64 servers (AWS Graviton, Ampere, Hetzner CAX), Apple Silicon Macs via Docker Desktop | Supported. |
| Raspberry Pi 5 with a 64-bit OS | Expected to work on its default 16 KiB kernel (`kernel_2712.img`; leave out any `kernel=kernel8.img` line in `config.txt`). Its 47-bit address space works with workerd under emulation, and workerd's arm64 binary is aligned for 16 KiB pages. It has not been tested on Pi 5 hardware yet: please report how it goes. |
| Raspberry Pi 4, 3, Zero 2 W with Ubuntu Server (64-bit) | Expected to work: Ubuntu's arm64 kernels have a 48-bit address space. Not yet tested on hardware. |
| Raspberry Pi OS (64-bit) on its 4 KiB kernel (Pi 3/4/Zero 2 W default, `kernel8.img` on a Pi 5) | Not yet. Those kernels have a 39-bit address space, and the official workerd's allocator needs 48 bits ([cloudflare/workerd#5020](https://github.com/cloudflare/workerd/issues/5020)). The image recognises this at start and says so. A community build of workerd without that allocator exists; the image takes it automatically on such kernels once a build of the pinned workerd version is published there and pinned in `deploy/docker/workerd-no-tcmalloc`. |
| 32-bit ARM (Raspberry Pi OS 32-bit, Pi Zero/1/2), RISC-V, ppc64le, s390x, Windows containers | Not supported: workerd has no build for them. Docker answers "no matching manifest". |

`zcat /proc/config.gz | grep ARM64_VA_BITS` on an arm64 host shows its address space (`ARM64_VA_BITS_39=y` is the unsupported case).

## Quick start

```bash
mkdir cloudhal && cd cloudhal
curl -fsSLO https://raw.githubusercontent.com/cloudhal-dev/cloudhal/main/deploy/docker/compose.yml
docker run --rm ghcr.io/cloudhal-dev/cloudhal:latest secrets > .env && chmod 600 .env
docker compose up -d
```

`secrets` prints a fresh `.env` with these values:

- the site's id (`CLOUDHAL_SITE_ID`);
- the cluster key;
- every secret the Workers need;
- credentials for the compose file's SeaweedFS.

Run it once per installation and keep the file. Every instance needs the same values, and `CLOUDHAL_SITE_ID` and `CLOUDHAL_CLUSTER_KEY` must never change once the installation exists. Treat `.env` as private: never commit it.

`docker compose up -d` starts SeaweedFS, then Cloudhal, which creates the bucket:

- Studio answers at http://localhost:8787 and the site at http://localhost:8788.
- The first start runs the database migrations and creates the installation's site, named after `CLOUDHAL_SITE_NAME`, from the blog starter. Nothing is published yet, so the site answers the "coming soon" page with 503 until the first publish.
- The log (`docker compose logs cloudhal`) prints the setup link, `http://localhost:8787/login#setup=<CLOUDHAL_SETUP_TOKEN>`. Put the value of `CLOUDHAL_SETUP_TOKEN` from `.env` in place of the placeholder, open the link and create the Owner account. Without the token, sign-up is refused, so nobody who reaches the port first can claim the installation.

After that, sign-up closes and everyone else joins by invite. Invites and password resets are links that Studio's Team page makes and you pass on yourself (see [limits](#limits)).

Agents connect to the MCP endpoint at `<base URL>/mcp` with an agent key made in Studio, or through OAuth ([connect an agent](../agents/clients.md)).

## Beyond localhost: a public origin

Set `CLOUDHAL_BASE_URL` in `.env` to the origin browsers open Studio at, such as `https://studio.example.com`. The log prints the setup link with it.

**The compose file's `caddy` profile** handles TLS for both hosts. Set these in `.env`:

- `CLOUDHAL_BASE_URL` (Studio) and `CLOUDHAL_SITE_URL` (the site), both `https://` origins;
- `CLOUDHAL_BEHIND_PROXY=1`;
- keep `CLOUDHAL_BIND=127.0.0.1`.

Point both names at the server, download the Caddyfile next to `compose.yml`, and start with the profile:

```bash
curl -fsSLO https://raw.githubusercontent.com/cloudhal-dev/cloudhal/main/deploy/docker/Caddyfile
```

```bash
docker compose --profile caddy up -d
```

**With a reverse proxy of your own** (nginx, Traefik, a load balancer):

- Proxy the Studio host to port 8787 and the site host to 8788.
- Set `CLOUDHAL_BEHIND_PROXY=1` and `CLOUDHAL_BASE_URL`.
- Send `X-Forwarded-Proto`, and append the client's address to `X-Forwarded-For`. Most proxies do both by default.

The Workers count rate limits by `CF-Connecting-IP`, as on Cloudflare. The image always removes the `CF-Connecting-IP` a request brings. With `CLOUDHAL_BEHIND_PROXY=1`, it sets the header to the last `X-Forwarded-For` hop, which is the address your proxy appended. The proxy must therefore append that hop and never pass on only what the client sent. Without the setting, rate limits share one bucket per path. Only set it when the proxy is the only way in.

For nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    # Build chat streams server-sent events
    proxy_buffering off;
}
```

## Environment

| Variable | What it does |
| --- | --- |
| `CLOUDHAL_SITE_ID` | The installation's site, from `secrets`. Never change it. |
| `CLOUDHAL_CLUSTER_KEY` | At least 32 random bytes, the same on every instance. It authenticates instances to each other and grants full control of them: keep it secret. |
| `BETTER_AUTH_SECRET`, `MCP_STATE_KEY`, `CLOUDHAL_PREVIEW_SECRET`, `CLOUDHAL_PURGE_TOKEN`, `CLOUDHAL_DEPLOY_TOKEN`, `CLOUDHAL_SETUP_TOKEN`, `CLOUDHAL_COMMENTS_KEY` | The Workers' secrets, from `secrets`. Each may instead be read from a file named by `<NAME>_FILE` (Docker and Kubernetes secrets). |
| `CLOUDHAL_S3_ENDPOINT`, `CLOUDHAL_S3_BUCKET`, `CLOUDHAL_S3_PREFIX`, `CLOUDHAL_S3_REGION` | The S3 store. The compose file defaults to its SeaweedFS and the bucket `cloudhal`. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | The store's credentials (`_FILE` works too). |
| `CLOUDHAL_CLUSTER_ADVERTISE` | The private `host:port` other instances reach this one at; the compose file sets `cloudhal:7000`. |
| `CLOUDHAL_BASE_URL`, `CLOUDHAL_BEHIND_PROXY` | As above. |
| `CLOUDHAL_SITE_NAME` | The name of the site the first start creates. |
| `CLOUDHAL_AUTOMATIONS` | `off` turns scheduled automations off. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Traces of every Worker invocation to an OTLP/HTTP collector. |
| `CLOUDHAL_BIND`, `CLOUDHAL_PORT`, `CLOUDHAL_SITE_PORT` | Compose only: the host address and ports for Studio (8787) and the site (8788). |

`docker compose exec cloudhal cloudhal-selfhost config` prints the workerd config the instance runs. Its output contains the cluster key, so do not share it.

## The store

The R2 binding and the cluster's bucket always go to an S3-compatible store. workerd's local test store is never used. The store must enforce conditional writes (`If-None-Match: *` and `If-Match` on PUT), because instances claim objects with them. workerd refuses a store that ignores them when an instance joins.

- **SeaweedFS** (Apache-2.0), in the compose file, is the default.
- **RustFS** (Apache-2.0) also passes the conformance checks.
- **Supported external stores:** AWS S3, Google Cloud Storage (its XML API) and Cloudflare R2. Set `CLOUDHAL_S3_ENDPOINT`, the bucket and the credentials, and stop the compose file's `seaweedfs` service. Cloudhal creates the bucket when it is missing (HEAD first, so credentials without CreateBucket work on an existing one; `CLOUDHAL_S3_CREATE_BUCKET=off` skips it).
- **Not supported:** MinIO's community edition (archived, no security fixes) and Garage (no conditional writes).

`node scripts/store-conformance.ts --endpoint <url> --bucket <b> --key <k> --secret <s>` checks a store before you rely on it:

- that `If-None-Match: *` is atomic under concurrency, and `If-Match` works;
- multipart uploads above 8 MiB;
- ListObjectsV2 paging;
- the lifecycle rule.

CI runs it against SeaweedFS and RustFS.

**Incomplete uploads.** At each start the image gives the bucket a lifecycle rule that aborts incomplete multipart uploads after a day. Without that rule, an upload that is cut off keeps its parts forever. The image adds the rule only when the bucket has no lifecycle configuration at all, because writing one replaces the whole configuration. Set the rule yourself on a bucket that already has rules, or set `CLOUDHAL_S3_LIFECYCLE=off` to skip this step.

## Several instances

Instances with the same `.env` and store form one installation. Each Durable Object, including the database, runs on one instance at a time, and any instance routes requests to it. A load balancer in front can send both hosts to any instance.

- **Network:** the cluster port 7000 must be reachable between instances only, on a private network. Instances authenticate each other with the cluster key, but their traffic is not encrypted, so use a VPC, WireGuard, Tailscale or Docker Swarm's `encrypted` overlay.
- **Stopping:** on SIGTERM an instance hands its objects to the others and exits within 8 s. `stop_grace_period: 15s` in the compose file allows for that.
- **A killed instance:** its objects move once its lease expires, about 20 s later.
- **Readiness:** use `GET /ready` on port 7000 as the readiness probe of a rolling restart.

The cluster runs on workerd's experimental cluster mode, so treat several instances as a preview until workerd documents it.

### Docker Swarm and Kubernetes

- **Docker Swarm:** [`deploy/swarm/`](https://github.com/cloudhal-dev/cloudhal/tree/main/deploy/swarm) has a stack file with these parts:
  - every secret as a Docker secret (`create-secrets.sh` reads the image's `secrets`);
  - two or more replicas behind the routing mesh, each advertising its address on the stack's encrypted overlay (`CLOUDHAL_CLUSTER_ADVERTISE=auto:<cidr>`);
  - a volume per task slot, and `start-first` rolling updates;
  - SeaweedFS pinned to a labelled node.
- **Kubernetes:** the Helm chart in [`deploy/helm/cloudhal`](https://github.com/cloudhal-dev/cloudhal/tree/main/deploy/helm/cloudhal) is published with each release as `oci://ghcr.io/cloudhal-dev/charts/cloudhal`. It has these parts:
  - a StatefulSet whose pods advertise `<pod>.<release>-peers` through a headless Service;
  - readiness on `/ready`, and a NetworkPolicy that admits the cluster port from the release's own pods only;
  - a PodDisruptionBudget;
  - an Ingress or Gateway API routes;
  - a Secret generated once and kept, and optionally SeaweedFS in the release.

- **Kubernetes without Helm:** [`deploy/kustomize/`](https://github.com/cloudhal-dev/cloudhal/tree/main/deploy/kustomize) has the chart's defaults rendered as a kustomize base, with the Secret from a `secretGenerator`.

`scripts/swarm-smoke.sh` and `scripts/helm-smoke.sh` (kind) run both recipes in CI with every image. Each smoke test covers a publish that is live on the next request and a rolling update while the site is polled.

## Upgrades

The image carries the same version as the npm packages and the release bundle. Tags are `X.Y.Z`, `X.Y` and `latest`; in production, pin `X.Y` (`CLOUDHAL_TAG=0.11`).

```bash
docker compose pull && docker compose up -d
```

Database migrations run when the admin Worker starts. With several instances, restart them one at a time.

**From the Node image (0.10.x and older).** That image ran `cloudhal studio` on Node and a static site. The workerd image cannot open its volume, and it refuses to start on one. It names the way out: export the site with the old image, start the new stack on new volumes, and import the archive.

```bash
docker run --rm -v cloudhal-data:/data ghcr.io/cloudhal-dev/cloudhal:0.10 cloudhal export --out /data/site.cloudhal
```

Then copy the archive out and import it into the new installation (`cloudhal import`, [site archives](site-archives.md)). Accounts are not part of an archive: create the Owner again with the setup link.

## Backup and restore

The store holds the whole installation: the database, media and the cluster's records. With the compose file that is the `cloudhal-store` volume. Stop the stack, archive that volume and start the stack again:

```bash
docker compose stop
```

```bash
docker run --rm -v cloudhal-store:/data -v "$PWD":/backup alpine tar czf /backup/cloudhal-store.tgz -C /data .
```

```bash
docker compose start
```

The `cloudhal-v2-data` volume holds each instance's working copy of its objects, which the store supersedes. Restore the store's archive into an empty `cloudhal-store` volume with `tar xzf`, and start on an empty `cloudhal-v2-data`. For an external store, use its own backups or versioning.

For one site rather than the installation, `cloudhal export` writes a portable `.cloudhal` archive ([site archives](site-archives.md)).

## Health

- `GET /api/health` on port 8787 answers `{ "ok": true }` without signing in, once the database is open and migrated. The image's `HEALTHCHECK` asks it every 30 s, and `docker compose ps` shows `healthy`.
- `GET /ready` on the cluster port answers 200 while the instance serves and holds its lease.
- The scheduler runs every minute on workerd's cron, once per installation however many instances there are.

## Limits

- **Mail.** There is no mail sender yet. Invites and password resets are links made on Studio's Team page and passed on by hand. An SMTP sender is the next step (RFC-0047 §6).
- **`render_page`** (the agents' screenshot tool) needs a browser, which the image does not carry, so the tool reports itself unavailable. A Chrome sidecar is planned.
- **One site** per installation for now (RFC-0047 decision 2).
- **No edge cache.** Every page renders on request. Put a CDN in front if you need one. A shared cache with purge on publish is a later step.
- **Analytics** (Cloudflare Analytics Engine) is not available when self-hosting.
- **Deploying to Cloudflare** from the container is not set up; use the CLI on your machine for that.

## Building the image yourself

```bash
docker build --build-arg CLOUDHAL_VERSION=0.11.0 -t cloudhal:local deploy/docker
```

This builds a release: the CLI from npm and the release's signed bundle from GitHub, verified by `cloudhal selfhost fetch` (key and yank lists, signature, every file). From a checkout, the `edge` way packs this checkout's packages and builds its unsigned bundle:

```bash
node scripts/pack-packages.ts deploy/docker/tarballs && pnpm --filter @cloudhal/studio build && node scripts/selfhost-edge-bundle.ts deploy/docker/bundle --no-build && docker build -t cloudhal:local deploy/docker
```

`node scripts/docker-smoke.ts --image cloudhal:local` runs what CI runs after every build: SeaweedFS, the first site and owner, a publish, a restart, the Node-volume guard, and a second instance taking over while the first stops.
