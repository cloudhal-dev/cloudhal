---
"@cloudhal/astro-renderer": patch
---

The `cloudflare` target no longer bakes `dataDir` into `virtual:cloudhal/config` (#239, RFC-0046 §11b). The Site Worker reads D1 and R2 through its bindings and never read the field. The value was the build machine's absolute path, which a release bundle built in CI would have carried to every deployment. Node targets (`cloudhal dev`, static builds) keep it.
