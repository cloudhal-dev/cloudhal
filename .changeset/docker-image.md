---
"@cloudhal/cli": patch
---

Self-hosting (#143): the official Docker image `ghcr.io/cloudhal-dev/cloudhal`, built from this release for linux/amd64 and linux/arm64 (tags `X.Y.Z`, `X.Y`, `latest`; `edge` nightly from `main`). One container runs `cloudhal studio` — Studio, the API and the MCP endpoint — with the project, its SQLite database and media on a `/data` volume; the first start on an empty volume scaffolds the project. `site-build` inside the container writes the public site as static HTML, which the compose file's optional Caddy serves with automatic TLS next to Studio. Guide: docs/guides/self-host.md.
