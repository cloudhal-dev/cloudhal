---
"@cloudhal/release-verify": patch
"@cloudhal/core-contracts": patch
---

Signed key and yank lists for release bundles (RFC-0046 §9, #226).

`@cloudhal/core-contracts` gains the `release-keys` root (`keys.json`, signed by an offline root) and the `release-yank-list` root (`yanked.json`, signed by a yank key and expiring 30 days after it is issued).

`@cloudhal/release-verify` gains:
- `verifyKeys`, which checks a pinned root's signature and that the list is fresh (`expires` at most 13 months after `issuedAt`);
- `verifyYanked`, which checks a signature by an active yank key that `keys.json` lists, and refuses a stale list with `stale-yank-list`;
- `mergeTrust`, which only reduces trust in the pinned keys: it revokes, marks retiring, and narrows a key's validity window, and it never adds a key.

`verifyRelease` now enforces each key's validity window. A statement's `createdAt` must lie within its key's `[notBefore, notAfter]`. After `notAfter`, a key verifies only while a fresh `keys.json` lists it as retiring; otherwise the release is refused with `key-expired`. `verifyRelease` also refuses a yanked version (`yanked`). `PINNED_KEYS` now carries each key's window.
