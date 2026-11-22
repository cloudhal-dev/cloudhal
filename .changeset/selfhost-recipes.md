---
"@cloudhal/cli": minor
---

Self-host recipes for Docker Swarm (`deploy/swarm`) and Kubernetes (the Helm chart in `deploy/helm/cloudhal`, published with each release as `oci://ghcr.io/cloudhal-dev/charts/cloudhal`) (RFC-0047 §10).

The self-host image changes in three ways:

- `CLOUDHAL_CLUSTER_ADVERTISE=auto` or `auto:<cidr>` advertises the container's own address, on that network.
- `CLOUDHAL_SITE_ID_FILE` is read like the other secrets.
- A front Worker before each socket now sets the client address the Workers rate-limit by. It always removes an incoming `CF-Connecting-IP`. Behind a proxy it takes the last `X-Forwarded-For` hop, so the proxy only needs to append that header, which most proxies do by default.
