# The official self-host image (docs/guides/self-host.md, issue #143): `cloudhal studio` — the API,
# the Studio UI and the MCP endpoint — on Node, with SQLite and the project's files on the /data
# volume. Built from the npm release (`CLOUDHAL_VERSION=x.y.z`), or from packed tarballs in
# `tarballs/` next to this file for the nightly `edge` tag (.github/workflows/docker.yml).
#
#   docker build --build-arg CLOUDHAL_VERSION=0.6.4 -t cloudhal:local deploy/docker
#   docker run --rm -p 127.0.0.1:8787:8787 -v cloudhal-data:/data cloudhal:local
#
# No compiler is installed: better-sqlite3 comes as a prebuilt binary for linux/amd64 and
# linux/arm64. The public site is `cloudhal build` output, published by `site-build` at /data/dist
# (a symlink to the newest build under /data/site, swapped atomically) for a web server such as the
# compose file's Caddy to serve from the same volume.

FROM node:24-bookworm-slim AS build
ARG CLOUDHAL_VERSION=""
COPY . /ctx
RUN node /ctx/install.mjs /ctx /opt/cloudhal \
  && npm cache clean --force \
  && rm -rf /root/.npm /tmp/*

FROM node:24-bookworm-slim
ARG CLOUDHAL_VERSION=""
LABEL org.opencontainers.image.title="Cloudhal" \
  org.opencontainers.image.description="Agent-native site platform: Studio, API and MCP server, self-hosted" \
  org.opencontainers.image.source="https://github.com/cloudhal-dev/cloudhal" \
  org.opencontainers.image.documentation="https://github.com/cloudhal-dev/cloudhal/blob/main/docs/guides/self-host.md" \
  org.opencontainers.image.url="https://cloudhal.dev" \
  org.opencontainers.image.vendor="Cloudhal" \
  org.opencontainers.image.licenses="Apache-2.0" \
  org.opencontainers.image.version="${CLOUDHAL_VERSION}"
# tini reaps and forwards signals as PID 1; certificates for Workers AI (REST) and media imports.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /opt/cloudhal /opt/cloudhal
COPY --chown=node:node bin/ /opt/cloudhal/bin/
ENV NODE_ENV=production \
  PATH="/opt/cloudhal/bin:/opt/cloudhal/node_modules/.bin:${PATH}" \
  CLOUDHAL_HOST=0.0.0.0 \
  CLOUDHAL_INIT=blog \
  CLOUDHAL_SITE_NAME="My site" \
  CLOUDHAL_SITE_BUILD=on
# (CLOUDHAL_SITE_BUILD_TIMEOUT, seconds, is a rebuild's deadline: 30 minutes unless set.)
USER node
WORKDIR /data
VOLUME ["/data"]
EXPOSE 8787
# /api/health is public and answers once the store is open and migrated; the first start on an
# empty volume scaffolds the project first, hence the start period.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["tini", "--", "/opt/cloudhal/bin/entrypoint"]
CMD ["studio"]
