---
"@cloudhal/cli": minor
"@cloudhal/api": minor
---

Self-host v2 (RFC-0047). The Docker image now runs the release bundle's own site and admin Workers on a pinned workerd: D1 is workerd's built-in D1, R2 lives in an S3-compatible store (SeaweedFS in the compose file), and the Durable Objects and cron are workerd's. Every installation is a workerd cluster, so a publish is live on the next request with no build, and several instances with the same settings serve one installation.

- New `cloudhal selfhost fetch|check|config|secrets|start`. These commands are the image's entrypoint, its workerd config generator and its bundle verifier.
- `POST /api/admin/sites` accepts an optional `id` from the deploy-token holder. A taken id answers 409. The self-host entrypoint uses it to create the site whose id it wrote into the config.
- The Node image is replaced, along with its `site-build`, its static site and `CLOUDHAL_SITE_BUILD`. The new image refuses a volume of the Node image and names the way out: `cloudhal export` with the old image, then `cloudhal import` into the new one.
