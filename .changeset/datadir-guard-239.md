---
"@cloudhal/astro-renderer": patch
---

The `cloudflare` target no longer bakes `dataDir` into `virtual:cloudhal/config` (#239, RFC-0046 §11b). The Site Worker reads D1 and R2 through its bindings and never read the field. The baked value was the build machine's absolute data path, so a release bundle built in CI would have carried that path to every deployment. Node targets (`cloudhal dev`, static builds) keep it.

The virtual module is now typed as `VirtualCloudhalConfig`, with `dataDir` optional; the type is exported, and the starter's `env.d.ts` uses it. Theme code that reads `dataDir` must handle its absence on the Cloudflare Site Worker.
