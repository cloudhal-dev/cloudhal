---
"@cloudhal/cli": minor
---

The self-host image is smaller and states which platforms it runs on (RFC-0047).

- **Smaller image:** the final stage is Debian with the node binary, the compiled `selfhost` entry, workerd and the bundle, with no CLI dependencies. It is 410 MB on disk (was 985 MB) and about 135 MB to download. The commands are now `cloudhal-selfhost start|check|config|secrets`.
- **Clear start-up errors:** the image recognises a 39-bit-VA arm64 kernel, such as Raspberry Pi OS's 4 KiB kernels where the official workerd cannot start, and an x86-64 CPU without x86-64-v2, and says what to do in each case. On a 39-bit kernel it takes a pinned tcmalloc-free community workerd build when one is configured.
- **Store set-up at start:** the entrypoint creates the bucket when it is missing and gives a bucket without lifecycle rules the rule that aborts incomplete multipart uploads. The compose `store-init` service, the Swarm job and the Helm init container are gone.
- **Recipes and checks:** a kustomize base rendered from the Helm chart, and `scripts/store-conformance.ts`, which checks S3 stores (SeaweedFS and RustFS pass).
