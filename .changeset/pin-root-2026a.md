---
"@cloudhal/release-verify": patch
---

`PINNED_ROOTS` now pins the offline root `cloudhal-root-2026a` (Ed25519, from the owner's root ceremony on 2026-11-15). `verifyKeys` verifies the published `keys.json` with it by default. The first `keys.json` lists the release key `cloudhal-release-2026a` and the yank key `cloudhal-yank-2026a`, and is committed as `security/keys.json`. A CLI built with this version can run `cloudhal deploy --release` once cloudhal.dev serves the lists.
