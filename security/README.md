# Release trust sources

The committed sources of Cloudhal's signed key list and yank list ([RFC-0046](../docs/rfcs/0046-release-bundles.md) §9). The runbook is [docs/security/release-signing-keys.md](../docs/security/release-signing-keys.md).

| File | What it is | Who changes it |
|---|---|---|
| `keys.source.json` | The release and yank keys, with their windows and statuses, that `keys.json` lists | A reviewed pull request, re-signed with the offline root (`node scripts/release-keys.ts sign-keys`) |
| `keys.json`, `keys.json.sig` | The root-signed key list, served at `https://cloudhal.dev/.well-known/cloudhal/keys.json` | `sign-keys` only; never edited by hand |
| `yank-list.json` | Yanked versions and revoked release key ids. **Append-only**: an entry is never removed | A reviewed pull request; the weekly *Yank list* workflow signs it into `yanked.json` |

`keys.json` does not exist until the owner's root ceremony (the runbook's *First-time setup*).
