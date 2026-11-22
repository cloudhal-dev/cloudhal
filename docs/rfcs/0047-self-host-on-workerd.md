# RFC-0047: Self-host v2: the release bundle on workerd, as a cluster on an S3 store

- Status: Accepted (2026-11-23, by Halil: the open questions are decided as recommended; see "Decisions (2026-11-23)").
- Author: Halil (Madraka), drafted with Claude · Date: 2026-11-23
- Related:
  - #263 is the issue; its owner decisions of 2026-11-23 are binding here: v2 replaces the Node image outright, workerd's local bucket store is never used, cluster mode is in the first release, and the Helm chart lives in `deploy/helm`.
  - #143, #150 and #165 are the Node image, its rebuild on publish, and the self-host auth hardening this design keeps.
  - ADR-0012 covers the two Workers and pointer-flip publishing. ADR-0006 covers the runtime choice.
  - RFC-0046 is the signed release bundle this image runs. RFC-0043 is `/api/health` and the status pages. RFC-0008 is the scheduler and the downgrade guard.
- Code read:
  - `deploy/docker/*`
  - `packages/cli/src/cloudflare/config.ts` (the bindings the Workers expect)
  - `packages/cloudflare/src/admin-worker.ts`
  - `packages/api/src/routes/admin/sites.ts` (`POST /api/admin/sites`)
  - The 0.10.1 release manifest (`bindingTemplates`, `durableObjects`, `runtime`)
- Sources (checked 2026-11-22/23):
  - workerd 1.20261122.2:
    - `workerd -h` and `workerd serve -h`
    - `workerd.capnp`: `ClusterConfig`, `ClusterBucket`, `AssetsService`, `CacheDirectory`, `HttpOptions`
    - The headers of the bundled modules `/workerd/d1.js`, `/workerd/r2.js`, `/workerd/cron.js` and `/workerd/ratelimit.js`
    - Releases v1.20261114.1 (Workflows in a cluster, cron fix), v1.20261117.1 (built-in D1, cloudflare/workerd#8486; standalone assets, #8475), v1.20261120.1 (R2 buckets, #8507; OTLP spans, #7686) and v1.20261121.1 (a Cache API shared across a cluster, #8508; leases and fencing, #8631 and #8637)
    - The README: "workerd is not a hardened sandbox", and systemd as its production advice
  - Object stores:
    - Garage known issues: no conditional writes, "structurally impossible"
    - SeaweedFS wiki, S3 Conditional Operations: atomic cluster-wide
    - The RustFS S3 compatibility matrix
    - R2 conditional operations
    - The MinIO community repository, archived in 2026

## Summary

The self-host image stops running `cloudhal studio` on Node and a static site rebuilt after each publish. Instead it runs the release bundle's own site and admin Workers (RFC-0046) on a pinned workerd: D1 is workerd's built-in D1, R2 is an S3-compatible store, and the Durable Objects and cron are workerd's. A publish is a pointer flip, live on the next request, exactly as on Cloudflare (ADR-0012). Every installation is a workerd cluster on an S3 bucket, of one instance or of many with identical config. The same image runs under `docker compose`, Docker Swarm and Kubernetes. A spike ran 0.10.1's bundle this way, unchanged, on two instances over SeaweedFS (§12).

## Motivation

- **Two products in one repository.** Self-host today is a second runtime: Node and better-sqlite3 run the API, `site-build` runs Astro on the server, Caddy serves a static copy, and its limits differ from Cloudflare's (no on-demand pages, one process per volume, a build queue, no mail, no `render_page`). Every feature has to be checked on both.
- **workerd caught up.** In the last two weeks workerd shipped everything the bundle's required bindings need, outside Cloudflare:
  - built-in D1, R2 over any S3-compatible store, and static assets;
  - cron that runs an occurrence once per cluster;
  - SQLite Durable Objects that replicate and fail over;
  - a shared Cache API, graceful handoff on SIGTERM, a readiness endpoint, and OTLP spans.

  Most of the new server code (bucket, cluster, the wrangler loader) is Rust.
- **One artifact to manage.** A remote deployer that installs and updates Cloudhal on someone's own infrastructure needs one signed artifact, one config surface and one health contract. The release bundle already is that artifact on Cloudflare, and this design makes it the artifact everywhere.
- **Why now.** No one runs the self-host images in production yet (owner, 2026-11-23). That makes this the cheapest moment to replace the image, and it can be done without a migration.

## Proposal

### 1. Runtime

- **The workerd binary.** One pinned build, `workerd@1.YYYYMMDD.N` from npm with its SHA-256 checked at image build. It is separate from the Miniflare 4 pin the test suites use (ADR-0012 addendum). An ADR records the two pins.
- **Config format.** workerd runs a generated Cap'n Proto config with `--experimental`. `wrangler.json` is not enough: in this release its fields are `$schema`, `name`, `main`, `compatibility_date`, `compatibility_flags`, `vars`, `durable_objects`, `exports`, `migrations` and `no_bundle`, plus `kv_namespaces`, `queues`, `triggers`, `workflows`, `d1_databases` and `assets` behind `--experimental`. There are no R2 buckets, no service bindings and no second Worker, and the admin Worker needs all three.
- **The config generator** lives in `@cloudhal/cli` (`src/selfhost/workerd-config.ts`). It reads the bundle's `manifest.json` (`bindingTemplates`, `durableObjects`, `runtime`, `workers.*.modules`, `workers.admin.assets.config`) and the environment (§4), so the Cloudflare configs and the workerd config come from one description of the bindings. A test pins the generated config for the starter bundle.

### 2. Services in one instance

| Service | Kind | What it is |
|---|---|---|
| `site` | worker | the bundle's `site/modules`, `CLOUDHAL_SITE_ID`, the site secrets; `cacheApiOutbound = "cache"` |
| `site-assets` | assets | `site/assets`, `userWorker = "site"`; the site socket's service |
| `admin` | worker | `admin/modules/worker.js`; the `SchedulerClock` and `BuildRoom` DOs (`enableSql`); `SITE` → `site-assets` |
| `admin-assets` | assets | `admin/assets`, the manifest's `run_worker_first`; the Studio socket's service |
| `d1` | worker | `bundled = "/workerd/d1.js"`, DO `D1Database`; the `DB` binding is `wrapped` `cloudflare-internal:d1-api` with props `{"database": "cloudhal"}` |
| `r2` | worker | `bundled = "/workerd/r2.js"`; the `BLOBS` binding is `r2Bucket` with props `{"bucket": "media"}` |
| `blobs` | bucket | `path = "blobs"`, in the cluster's bucket (§3) |
| `cron` | worker | `bundled = "/workerd/cron.js"`, DO `Schedule`; `CRONS = {"admin": ["* * * * *"]}` (the manifest's `cron`) |
| `do-storage` | disk | `/data/do`, each instance's own SQLite files |
| `cache` | cache | `/data/cache`, shared across the cluster |

Invariants:

1. Durable Object `uniqueKey`s are constants: `cloudhal-d1`, `cloudhal-cron`, `cloudhal-scheduler-clock` and `cloudhal-build-rooms`. Changing one starts that namespace empty, so they are never derived from a version, a host or a site id.
2. Every instance of an installation gets the same generated config. Only sockets, `advertise` and the per-instance directories may differ, as `ClusterConfig` requires.
3. Secrets reach Workers only through `fromEnvironment` bindings of the instance config, filled from files (§4). Nothing is ever published as a bucket deployment, because a deployment cannot have `fromEnvironment` and anyone who can write deployments runs code on every instance.

### 3. Always a cluster, always an S3 store

- **The cluster.** Every installation sets `Config.cluster`, a cluster of one instance included. Its bucket is `s3://<bucket>/<prefix>cluster`. R2 objects live under `services/blobs/` in the same bucket, D1 and the DOs replicate through it, and alarms and cron fail over with their objects.
- **No local store.** workerd's `localDisk` bucket store is never configured. The `r2.js` header and #8507 document it "for development and tests", and with a cluster set it is ignored anyway.
- **What the store must enforce.** Leases and object owners are `If-None-Match: *` and `If-Match` PUTs, and a store that ignores them is refused when an instance joins. The store also needs:
  - multipart uploads, which R2 puts over 8 MiB use;
  - ListObjectsV2 with continuation tokens;
  - path-style URLs and `UNSIGNED-PAYLOAD` SigV4;
  - a lifecycle rule that aborts incomplete multipart uploads.
- **Which stores.**
  - **SeaweedFS** is the default in every recipe: Apache-2.0, conditional PUTs documented as atomic cluster-wide, and the spike's cluster join passed on it.
  - **RustFS** (Apache-2.0) is offered once it passes the conformance suite.
  - **AWS S3, GCS and R2** are supported as external stores.
  - **MinIO** (archived, no fixes) and **Garage** (no conditional writes) are not offered.
- **Conformance suite.** `@cloudhal/storage/testing` gains a store suite that CI runs against each offered store before its image digest is pinned. It covers:
  - concurrent `If-None-Match: *` (exactly one 200, the rest 412) and `If-Match` races;
  - multipart above 8 MiB and ListObjectsV2 paging;
  - path-style and `UNSIGNED-PAYLOAD`;
  - workerd's own cluster join.

### 4. Configuration surface (environment)

Every secret is also read from `<NAME>_FILE`, for Docker and Kubernetes secrets. The entrypoint reads these variables and writes the config. Workers see only their bindings.

| Variable | Meaning |
|---|---|
| `CLOUDHAL_S3_ENDPOINT`, `CLOUDHAL_S3_BUCKET`, `CLOUDHAL_S3_PREFIX`, `CLOUDHAL_S3_REGION` | the store; `aws_endpoint`, `aws_region` and the bucket URL |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (or `AWS_CREDENTIALS_FILE`) | store credentials; the file is reread on change, so keys rotate without a restart |
| `CLOUDHAL_CLUSTER_KEY` | ≥ 32 random bytes, the same on every instance |
| `CLOUDHAL_CLUSTER_ADVERTISE` | the private `host:port` peers reach this instance at (`$(POD_IP):7000` in Kubernetes) |
| `CLOUDHAL_BASE_URL`, `CLOUDHAL_SITE_URL` | Studio's and the site's public origins, as today |
| `CLOUDHAL_BEHIND_PROXY` | `1`: the sockets take the scheme from `X-Forwarded-Proto` and trust `CF-Connecting-IP` (§8) |
| `BETTER_AUTH_SECRET`, `MCP_STATE_KEY`, `CLOUDHAL_PREVIEW_SECRET`, `CLOUDHAL_PURGE_TOKEN`, `CLOUDHAL_DEPLOY_TOKEN`, `CLOUDHAL_COMMENTS_KEY` | the manifest's `secrets`; generated by `cloudhal-selfhost secrets` and never defaulted |
| `CLOUDHAL_SETUP_TOKEN` | the first Owner's token, as on Node today (#165) |
| `CLOUDHAL_SITE_NAME`, `CLOUDHAL_INIT` | the first site, created at first start (§5) |
| `CLOUDHAL_AI_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Workers AI over REST, unchanged |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | optional; becomes an `ExternalServer` in `tracing.otlp` |

There are no roles. Every instance runs the same services, because workerd's cluster requires identical config and routes any request to the instance that owns its object. To scale, add replicas behind the load balancer. Both hosts (Studio and site) can point at any instance.

### 5. First start and the first site

The entrypoint runs `cloudhal-selfhost start`:

1. Read the secrets and refuse to start if any is missing.
2. Refuse a volume with the Node layout (`/data/cloudhal.json` but no `/data/.selfhost`). The error names the way out: `cloudhal export` with the old image, then `cloudhal import` into v2.
3. Verify the image's release bundle (`verifyRelease`, `PINNED_KEYS`; the check also runs at image build).
4. Write the config and exec workerd under tini. workerd is the process that receives SIGTERM, so its handoff runs.
5. In the background, once `/api/health` answers, create the first site if there is none:
   - `POST /api/admin/sites` with the deploy token, named after `CLOUDHAL_SITE_NAME`, filled from the starter (`CLOUDHAL_INIT`);
   - print the setup link, as the Node image does.

   A lock object in the bucket (`If-None-Match: *`) makes sure only one instance does this.

The site Worker needs the site's id in its config (`CLOUDHAL_SITE_ID`). Open question 1 asks how that id is known before the first start.

### 6. Binding map

| Binding (manifest) | On workerd | Spike |
|---|---|---|
| `DB` d1 (required) | `/workerd/d1.js`, one DO, replicated | migrations 0001–0034 ran; reads and writes; survived restart and failover |
| `BLOBS` r2 (required) | `/workerd/r2.js` → `blobs` bucket on S3 | publish wrote bundle shards; HEAD/GET/PUT ok |
| `SITE` service (required) | `site-assets` | publish's purge call reached the site Worker |
| `ASSETS` (required) | `admin-assets` / `site-assets`, `AssetWorker` entrypoint | Studio SPA and site assets served |
| `SCHEDULER_CLOCK`, `BUILD_ROOMS` DOs | worker DOs, `enableSql` | constructed; alarms adopted after failover |
| cron `* * * * *` | `/workerd/cron.js` | armed; re-armed by itself after a failover; no request backstop needed afterwards |
| edge cache (`cache: true`) | not used: the site Worker reports "no edge cache in this runtime" and sends `no-store` semantics | a CDN or the proxy in front may cache. The shared Cache API is a later, measured step (open question 3) |
| `ANALYTICS` analytics engine, `ANALYTICS_SQL` | absent (optional bindings) | analytics off on self-host for now |
| `ANALYTICS_RL`, `COMMENTS_RL` ratelimit | `/workerd/ratelimit.js` | counts are per process, not per cluster; acceptable for these soft limits |
| `EMAIL` send_email | **new:** an SMTP sender Worker (`CLOUDHAL_SMTP_URL`) behind the same binding | follow-up PR, removes the "no mail" limit |
| `BROWSER` | **new:** optional Chrome sidecar over CDP | follow-up PR, removes the "no `render_page`" limit |
| `AI` | REST with `CLOUDHAL_AI_TOKEN`, as today | unchanged |

### 7. Health, readiness and shutdown

- **Liveness:** `GET /api/health` on the Studio socket (RFC-0043).
- **Readiness:** `GET /ready` on the cluster port. It answers 200 while the instance serves, holds its lease and is not stopping, and 503 otherwise.
- **Shutdown:** on SIGTERM workerd hands its Durable Objects to its peers, keeps accepting requests for at least 5 s, and exits within `stopTimeoutMs`, which stays at 8 s. The recipes set `stop_grace_period: 15s` (Compose and Swarm) and keep Kubernetes' 30 s grace period.
- **A killed instance:** its objects move only when its lease expires, after about 20 s. The spike measured about 16 s of 500 answers for D1-backed routes, which needs at least two replicas behind a readiness-aware load balancer.

### 8. Client address

*Amended 2026-11-23, in phase 3:* a small front Worker sits in front of each socket (`packages/cli/src/selfhost/front-worker.ts`). It always removes an incoming `CF-Connecting-IP`. Behind a proxy it sets the header to the last `X-Forwarded-For` hop, which is how `cloudhal studio --behind-proxy` read the address on Node (#165). So no proxy needs to set `CF-Connecting-IP`, and an ingress that passes client headers through cannot be spoofed. The text below describes the first design.

workerd cannot inject the peer address as a header. The admin Worker counts rate limits by `CF-Connecting-IP`, as on Cloudflare.

- **Without a proxy,** the sockets remove any incoming `CF-Connecting-IP` with `injectRequestHeaders`, so a client cannot choose its own address. Rate limits then share one bucket per path, which Better Auth logs. This is the same guarantee #165 gave on Node.
- **With `CLOUDHAL_BEHIND_PROXY=1`,** the header is kept, and the proxy must overwrite it with the client's address:
  - Caddy: `header_up CF-Connecting-IP {remote_host}`;
  - nginx: `proxy_set_header CF-Connecting-IP $remote_addr`;
  - ingress-nginx: a configuration snippet.

  `forwardedProtoHeader = "X-Forwarded-Proto"` is set the same way.

### 9. The image

- **Base:** `node:24-bookworm-slim` (glibc 2.36; workerd needs ≥ 2.35), with tini.
- **Contents:**
  - the pinned workerd;
  - the extracted and verified release bundle of the image's version, read-only under `/opt/cloudhal/bundle`;
  - `@cloudhal/cli`, which holds the config generator and the jobs (`export`, `import`, `backup`, `restore`, `doctor`, `secrets`).
- **Hardening:** non-root, with `/data` the only writable path, so `readOnlyRootFilesystem` works.
- **Ports:** 8787 (Studio), 8788 (site) and 7000 (cluster; never published to the host).
- **Removed:** `site-build`, `CLOUDHAL_SITE_BUILD*`, the static site under `/data/site`, and Caddy's file server. Caddy stays as an optional TLS proxy only.

### 10. Recipes

- **`deploy/docker/compose.yml`:**
  - `cloudhal` and `seaweedfs` by default, and `docker compose up -d` is the quick start;
  - profiles `caddy` (TLS for both hosts), `chrome`, `otel` and `mail` (Mailpit);
  - a `cloudhal-init` one-shot that creates the bucket and its lifecycle rule.
- **`deploy/swarm/stack.yml`:**
  - N replicas of `cloudhal` on an overlay network marked `encrypted` (peer traffic is plain TCP);
  - secrets as files and `update_config.order: start-first`;
  - SeaweedFS as its own stack, or an external store.
- **`deploy/helm/cloudhal` (OCI chart on ghcr, versioned with the fixed group) and a Kustomize base:**
  - a StatefulSet with stable network identities for `advertise`, a headless Service for the cluster port, and a NetworkPolicy that limits port 7000 to the chart's pods;
  - probes as in §7 and a PodDisruptionBudget (`maxUnavailable: 1`);
  - Ingress or Gateway API `HTTPRoute`s for both hosts;
  - SeaweedFS as a subchart dependency (off when an external store is set), and a Job that creates the bucket.
- **Optional:** systemd units with socket activation (`--socket-fd`) for a host without an orchestrator.

### 11. Versions and supply chain

- **One version everywhere:** the image `X.Y.Z` holds bundle `X.Y.Z`. `X.Y`, `latest`, the chart and the image move together (#263, decision 1).
- **workerd bumps** happen weekly through Dependabot, not daily, and land only when the conformance suite and the cluster smoke pass on the new binary.
- **Gates:** SBOM, provenance, Trivy (CRITICAL/HIGH), tag-after-smoke, amd64 and arm64, as `docker.yml` does today. The smoke covers publish → live without a build, a restart keeping data, and a two-instance handoff.

### 12. Spike results (2026-11-23)

- **Setup:**
  - Machine: macOS arm64.
  - workerd 1.20261122.2.
  - Store: SeaweedFS (`chrislusf/seaweedfs:latest`, one container, S3 on 8333).
  - Bundle: 0.10.1, verified with `scripts/release-bundle.ts verify`, unchanged.
  - Config: generated by a 120-line script.
- **Start:** both Workers started, the instance joined the cluster on SeaweedFS (so the conditional-write check passed), and cron armed. `/api/health` answered 200 after the migrations ran (0.55 s on an empty store). Studio's SPA was served.
- **First site:** `POST /api/admin/sites` with the deploy token created the site (201). The owner signed up with the setup token header (200).
- **Publish:** `POST /api/sites/:id/snapshots {"publish": true}` returned 201 in 0.19 s. The next request to the site socket returned 200 (24 ms cold, 3–5 ms warm). There was no build. Before the publish the site answered RFC-0043's 503 "Coming soon".
- **Restart:** sites, accounts and the published pointer survived (D1 recovered from the bucket, "epoch 2 recovers 1").
- **Second instance:** it joined the cluster and served Studio and the site, routing D1 to its owner.
  - SIGTERM on the owner: D1 and cron were handed off and every request kept answering 200.
  - SIGKILL on the owner: 63 answers of 500 over about 16 s, then the survivor took over at epoch 5. The published pointer and content were intact, and cron re-armed by itself.
- **Memory:** 56 MB RSS for an idle instance, 136 MB for one that had served Studio's API.
- **Found:**
  - R2 bindings need the bucket name in props.
  - Rate limits saw no client address (§8).
  - `nodejs_compat` warnings are harmless (it is the default since 2026-08-04).
  - workerd's local R2 store and `wrangler.json` were not used and are not needed.

## Alternatives considered

| Option | Pros | Cons | Why not |
|---|---|---|---|
| Keep the Node image and the static site (today) | It exists and is tested | A second runtime, a build server in every container, limits Cloudflare doesn't have, one process per volume | It is what this RFC replaces |
| `workerd serve wrangler.jsonc` | No generator | No R2, no service bindings, one Worker | It cannot express the admin Worker |
| workerd's local bucket store on one node | No store container | Documented for development and tests; a second instance cannot share it; data moves when you scale | Owner decision: never |
| MinIO / Garage as the store | Popular, light | MinIO is archived with no fixes; Garage cannot do conditional writes, so the cluster refuses it | Fails the requirements in §3 |
| Separate `admin` and `site` roles | Scale the read path alone | workerd's cluster requires identical config on every instance, and any instance may route to any object | Replicas of one config already scale both |
| A Kubernetes operator | Day-2 automation | A large surface to build and secure | A chart is enough until a remote deployer needs more |
| A runtime of our own (Node + an adapter layer) | Full control | Re-implements D1, R2, DOs and cron, and drifts from Cloudflare | workerd is the reference implementation |
| Rewrite the core in Rust (workers-rs) | Rust end to end | workers-rs is 0.8.x; a rewrite is unrelated to deployment | Separate RFC, later |

## Compatibility & migration

- **Contracts:** no contract or `schemaVersion` changes. The Workers, migrations and data model are the release bundle's, as on Cloudflare.
- **Migration:** there is none (#263, decision 1). A v2 image refuses a Node-layout volume and points to export and import. Images up to 0.10.x stay on ghcr for anyone who needs to read an old volume.
- **Rollout:**
  1. This RFC.
  2. The config generator, the entrypoint and the Compose recipe with SeaweedFS (single instance), plus the store conformance suite and the smoke.
  3. The cluster in Compose and Swarm, plus the Helm chart, Kustomize and a `kind` 3-node smoke with a node killed mid-publish.
  4. The SMTP and Chrome sidecars.
  5. Docs (`docs/guides/self-host.md` rewritten).

  The first v2 release ships after step 3.
- **Rollback:** within v2, the previous image tag. The bundle's manifest (RFC-0046) carries the migration range and DO class changes, so the entrypoint refuses a downgrade the data cannot take (RFC-0008).

## Security & policy impact

- **Sandboxing.** workerd "is not a hardened sandbox". The image runs only its own verified bundle, offers no way to upload Worker code, and never publishes bucket deployments (§2, invariant 3).
- **Cluster key and bucket.** Both grant full control of every instance. They are secrets (`*_FILE`), never logged, and the bucket credentials are scoped to one bucket.
- **Peer traffic** is authenticated by MAC but not encrypted. Recipes keep it on a private or encrypted network: a Swarm `encrypted` overlay, a Kubernetes NetworkPolicy, or WireGuard or Tailscale between hosts. workerd refuses a public `address` unless told otherwise, and the generator never tells it otherwise.
- **Client addresses** cannot be spoofed without a proxy (§8).
- **No new scopes and no approval changes.** The policy engine, auth and MCP are the bundle's, unchanged.

## Decisions (2026-11-23)

The owner took the recommendation on each open question:

1. **First site id.** `POST /api/admin/sites` accepts an optional `id` (the site id format) from the deploy-token holder. The entrypoint picks the id, writes it into the config and then creates the site. A taken id answers 409.
2. **Several sites.** The first release serves one site per installation. `CLOUDHAL_SITE_IDS` and the host map follow in a later release.
3. **Cache.** The first release ships with no cache, and `no-store` is fine. The shared Cache API with purge on publish is a later, measured step.
4. **D1 throughput.** Before the first release, the cluster smoke records a publish made while many agents write.
5. **Analytics.** Analytics is off on self-host. A SQL rollup table as a stand-in for Analytics Engine is a later RFC.

## Open questions (decided above)

1. **The first site's id before the first start.**
   - (a) `POST /api/admin/sites` accepts an optional `id` from the deploy-token holder, so the entrypoint picks it first. This is recommended: one small API change, covered by the API suite.
   - (b) Restart the instances after the first site exists. This is simpler but puts a restart into first run.
   - (c) The site Worker resolves its site by host when `CLOUDHAL_SITE_ID` is unset, which is a renderer change.
2. **Several sites in one installation** (RFC-0034). The site Worker's `CLOUDHAL_SITE_IDS` and host map work the same here, and the generator reads them from the store at start. In scope for the first release, or after it?
3. **Caching the site.** No cache at first (correct and simple). A later step uses the shared Cache API with purge on publish, measured against a CDN in front. Is that acceptable for the first release?
4. **D1 throughput.** One database is one Durable Object, with one writer, on one instance. That fits Cloudhal's write rate, but the cluster smoke should record a publish under load from many agents before the release.
5. **Analytics on self-host.** It is off for now. Should a SQL rollup table stand in for Analytics Engine later, or should analytics stay Cloudflare-only?
