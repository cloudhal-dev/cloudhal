---
"@cloudhal/cli": minor
"@cloudhal/release-verify": patch
"@cloudhal/astro-renderer": patch
---

`cloudhal deploy --release` installs the signed release of the CLI's own version instead of building the project (RFC-0046 §11b, #227).

- **Trust lists.** On every run it fetches the signed key list and yank list from cloudhal.dev and verifies them against the pinned root. It never falls back to an older copy. It keeps a yank memory in `~/.cloudhal/release-trust.json`, so a rolled-back list, a replayed key list or a revoked yank key is refused.
- **Before the root ceremony** no root is pinned, so the command refuses and names the ceremony.
- **The release.** The release must be published (not a draft) and carry a bundle; `v0.8.0` and older have none. The CLI verifies it with `@cloudhal/release-verify`: the keys reduced by both lists, yanked versions refused, and every file checked against its digest.
- **The attestation.** It checks the build-provenance attestation with `gh`. `--allow-single-factor` continues on the release key alone when `gh` is unavailable; a failed attestation is always refused.
- **The project.** Its theme files must equal the CLI's own starter, unless `--discard-local-theme` is given. Its `cloudhal.json` build keys must match the starter's, a key the CLI does not know is refused, and the installed wrangler must be at least the bundle's.
- **Refused projects.** Projects attached to another installation, multi-site projects and Workers Builds are refused.
- **Deploying.** The verified files are extracted into a fresh `.cloudhal/deploy/release/<version>/`. Both Workers are then deployed with `no_bundle` wrangler configs that upload exactly those bytes.
- **Offline and dry runs.** `--from <dir>` installs offline from the assets and both lists, and `--release --dry-run` stops before wrangler.

The CLI now depends on `@cloudhal/release-verify`.

`@cloudhal/release-verify` now typechecks under every consumer's lib settings: WebCrypto inputs are `ArrayBuffer`-backed views, and the gzip pipe is typed through explicitly. `@cloudhal/astro-renderer` names the Site Worker's single-site choice `singleSiteId`, so a test holds that `CLOUDHAL_SITE_ID` overrides the built id.
