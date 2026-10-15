---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
---

Interaction runtime (RFC-0020 phase 20e): `Toggle`, `Select` and `Slider` primitives write to the surface's data through a `{path}` binding on `value`; `Button.onClick` runs a named action (`set`, `toggle`, `increment`, `reset`, `navigate`, `copy`, `share`, `scrollTo`; the store checks what each needs); `isInteractive`. Live surfaces carry their data as escaped inert JSON, bound text (`data-ch-text`), inputs (`data-ch-model`), actions (`data-ch-action`) and hidden conditional components (`data-ch-visible`), and load `/_cloudhal/surface.1.js` — a constant ~5.7 KB module, hash-pinned, served by `cloudhal dev` and written by builds — whose functions and conditions equal the server's.
