---
"@cloudhal/agent-runtime": minor
"@cloudhal/api": minor
"@cloudhal/mcp-server": minor
"@cloudhal/storage": minor
"@cloudhal/cli": minor
"@cloudhal/cloudflare": minor
---

Staff roles and invites (RFC-0005, ADR-0018).

- Five roles (Owner, Administrator, Editor, Author, Contributor) are named sets of the policy engine's scopes, with own-limited variants (`content:draft:own`, `content:write:own`, `site:publish:own`) and person-only scopes (`site:settings`, `members:*`, `agents:manage`, `audit:read`). A person's role is read from their membership on every request.
- Agent keys never exceed their creator: scopes must fit the role when minted and are narrowed to the creator's current role on every call; demotion rewrites keys, modes and elevations; removal disables keys. Only a key's creator grants elevations.
- Authors publish own-only change sets; anything wider becomes an approval request (cause `role`). Only someone who could make a call right now may approve it, and nobody approves their own request.
- REST is default-deny (`ROUTE_SCOPES`); `author` is server-controlled; `open` sign-ups join as Contributors.
- New routes: `/api/members` (list, change role, remove, transfer ownership, password-reset links), `/api/invites` (single-use, hashed, email- and role-bound links; `inspect`/`accept`), `/api/password-reset`, `/api/activity`, `POST /api/admin/owner`; `/api/me` reports `role`, `scopes` and `can`; `/api/instance` reports `roles` and `invites`. Pluggable `MailSender`.
- Breaking: `createAuth` requires `sql` (a `SqlDriver` on the same database) and `createApi` takes `staff`; Better Auth's `/api/auth/organization/*`, `/api/auth/admin/*` and `/api/auth/api-key/*` answer 404 over HTTP. Storage migration `0012_roles` makes the earliest user the Owner and any others Administrators.
- CLI: `cloudhal owner transfer --to <email>` recovers a locked-out deployment with the deployment token.
