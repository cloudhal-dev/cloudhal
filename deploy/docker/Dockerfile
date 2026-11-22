# The official self-host image (RFC-0047, docs/guides/self-host.md): the release bundle's own site
# and admin Workers on a pinned workerd, as one instance of a cluster whose state lives in an
# S3-compatible store (SeaweedFS in the compose file). D1 is workerd's built-in D1, R2 the store,
# the Durable Objects and cron workerd's; a publish is live on the next request, as on Cloudflare.
#
#   docker build --build-arg CLOUDHAL_VERSION=0.11.0 -t cloudhal:local deploy/docker
#   docker compose -f deploy/docker/compose.yml up -d     (after `cloudhal selfhost secrets > .env`)
#
# Built from the npm release and the GitHub release's signed bundle (`CLOUDHAL_VERSION`), or for
# the nightly `edge` tag from packed tarballs in `tarballs/` and this ref's bundle in `bundle/`
# (.github/workflows/docker.yml). workerd's version is pinned in `workerd-version`.

FROM node:24-bookworm-slim AS build
ARG CLOUDHAL_VERSION=""
COPY . /ctx
RUN node /ctx/install.mjs /ctx /opt/cloudhal \
  && npm cache clean --force \
  && rm -rf /root/.npm /tmp/*

FROM node:24-bookworm-slim
ARG CLOUDHAL_VERSION=""
LABEL org.opencontainers.image.title="Cloudhal" \
  org.opencontainers.image.description="Agent-native site platform: Studio, API, MCP server and the site, on workerd, self-hosted" \
  org.opencontainers.image.source="https://github.com/cloudhal-dev/cloudhal" \
  org.opencontainers.image.documentation="https://github.com/cloudhal-dev/cloudhal/blob/main/docs/guides/self-host.md" \
  org.opencontainers.image.url="https://cloudhal.dev" \
  org.opencontainers.image.vendor="Cloudhal" \
  org.opencontainers.image.licenses="Apache-2.0" \
  org.opencontainers.image.version="${CLOUDHAL_VERSION}"
# tini reaps and forwards signals as PID 1 (to `cloudhal selfhost start`, which passes one SIGTERM
# on to workerd so its cluster handoff runs); certificates for an https store and Workers AI.
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends tini ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data && chown node:node /data
COPY --from=build /opt/cloudhal /opt/cloudhal
COPY bin/ /opt/cloudhal/bin/
ENV NODE_ENV=production \
  PATH="/opt/cloudhal/bin:/opt/cloudhal/node_modules/.bin:${PATH}" \
  CLOUDHAL_BUNDLE=/opt/cloudhal/bundle \
  CLOUDHAL_DATA_DIR=/data \
  CLOUDHAL_RUN_DIR=/tmp/cloudhal
# The image is read-only but for /data (Durable Object files) and /tmp (the generated config).
USER node
WORKDIR /data
VOLUME ["/data"]
# 8787 Studio, the API and /mcp; 8788 the site; 7000 the cluster port (peers only, never public).
EXPOSE 8787 8788 7000
# Liveness: /api/health answers once D1 is open and migrated. Readiness for a rolling restart is
# GET /ready on the cluster port (the Helm chart's readinessProbe).
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.CLOUDHAL_PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["tini", "--", "/opt/cloudhal/bin/entrypoint"]
CMD ["start"]
