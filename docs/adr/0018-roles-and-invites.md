# ADR-0018: Staff roles are scope sets; agent keys never exceed their creator; invites are one-time links
- Status: Accepted
- Date: 2026-10-08
- Related: RFC-0005 (the design; this ADR records the decision), ADR-0004, ADR-0010, ADR-0011, ADR-0014, ADR-0015, ADR-0016, ADR-0017
- Sources: Better Auth 1.7.7 organization and admin plugins (as installed, and https://www.better-auth.com/docs/plugins/organization, https://www.better-auth.com/docs/plugins/admin); Ghost staff roles (https://ghost.org/help/managing-your-team/, https://docs.ghost.org/staff)

## Context
Every signed-in person had `*` scopes, and sign-up closed after the owner, so a team could not be added safely. The scopes model already treats people and agents alike, and agent keys, modes, elevations and approvals (ADR-0014–0016) need to respect who created a key and who may decide a request. REST also accepted an entry's `author` from the request body.

## Decision
Adopt RFC-0005 as accepted, including its recommended answers:
- **Roles are named scope sets.** Owner, Administrator, Editor, Author and Contributor map onto the policy engine's scopes. "Own" variants exist for Authors and Contributors: `content:draft:own`, `content:write:own` and `site:publish:own`. Some scopes are people-only and never grantable to a key: `site:settings`, `members:*`, `agents:manage` and `audit:read`.
- **Agent keys never exceed their creator.** At creation a key's scopes must fit the creator's role. On every call the key's effective scopes are cut down to the creator's current role, and a key whose creator is no longer a member is refused. Demotion lowers keys, modes and elevations at once; removal disables keys and denies their pending requests. Only a key's creator grants it elevations.
- **Approvals follow roles.** Only someone who could make the same call now may decide a request; nobody approves their own person-filed request. A person may approve their own agent's request by default.
- **Author publishes.** Publishing moves one pointer per site, so an Author's publish goes live only when every public change is the Author's own. Otherwise it becomes an approval request (cause `role`) for an Editor.
- **Membership storage.** Membership lives in Better Auth's organization plugin, one organization per deployment now and one per tenant in Cloud. Its raw HTTP endpoints are blocked, so every membership change goes through Cloudhal's audited routes. There is exactly one Owner. Ownership moves by transfer with password re-entry; `cloudhal owner transfer` with the deployment token recovers a locked-out deployment.
- **Invites are one-time links.** A link is `chinv_` plus 256 random bits, stored as a SHA-256 hash and carried in the URL fragment. It is bound to one role and one email and is revocable. It expires after 7 days by default (range 1 h–14 d; Administrator invites at most 72 h). Sign-up stays closed, and accepting an invite creates the account server-side. A pluggable mail sender can deliver links later.
- **REST is default-deny.** Every route declares its requirement in a route table, and a test fails for any route that does not. `author` is server-controlled: only Editors and above may set or change ownership fields. `open` sign-ups become Contributors.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Keep "every person is `*`" until Cloud | No work now | No safe team, no Contributor flow, approvals by anyone | P0 publisher gap; agents amplify a too-broad human role |
| A Cloudhal-only roles table | Full control | Duplicates Better Auth membership; Cloud migration later | Better Auth org tables exist and map to tenants |
| Per-post publish for Authors | Familiar from Ghost | Breaks the single-pointer snapshot model and atomic rollback | Change-set rule keeps the model and still lets Authors publish their own work |
| Email-only invites | Familiar | No mail infrastructure yet | Links now, a pluggable sender later |

## Consequences
- **Positive:**
  - Teams can be added safely.
  - Agents inherit their creator's limits, and demotions take effect on the next call.
  - Approvals cannot be decided by someone who could not make the change.
  - Every membership change is audited.
- **Negative:**
  - Every REST route needs a declared requirement.
  - "Own" checks add reads on writes and publishes.
  - The single-pointer model makes Author publishes conditional.
- **Risks:**
  - Invite-link leakage: links are bound to an email, single use, expiring and revocable.
  - A misconfigured route table: the default-deny test guards against it.
  - Effective scopes recomputed on every call: they are cached per request only.
