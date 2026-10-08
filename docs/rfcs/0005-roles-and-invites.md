# RFC-0005: Staff roles and invites
- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-08
- Related: ADR-0004 (MCP, layered approval), ADR-0010 (Better Auth), ADR-0011 (policy engine), ADR-0014 (out-of-band approvals), ADR-0015 (agent modes), ADR-0016 (time-boxed elevation), ADR-0017 / RFC-0002 (taxonomy governance, bylines follow-up), RFC-0003 (menus), RFC-0004 (assets), `docs/security/threat-model.md`
- Sources: Better Auth 1.7.7 as installed (`better-auth/dist/plugins/organization/{types.d.mts,access/statement.mjs,routes/crud-invites.mjs,routes/crud-members.mjs}`, `plugins/admin/routes.mjs`, `api/routes/sign-up.mjs`) · https://www.better-auth.com/docs/plugins/organization (access control, `createAccessControl`, invitations, `organizationHooks`, `additionalFields`) · https://www.better-auth.com/docs/plugins/admin (`createUser`, `revokeUserSessions`, `banUser`) · https://ghost.org/help/managing-your-team/ · https://docs.ghost.org/staff · https://ghost.org/help/transfer-publication-ownership/
- Contracts: none changed on this branch. §8 describes one optional, additive contract field for the implementation phase.

## Summary
Every signed-in person gets `*` today, so a deployment cannot safely have a second person. This RFC adds five Ghost-like staff roles (Owner, Administrator, Editor, Author, Contributor) that are **named sets of the scopes the policy engine already uses**, so people and agents stay one kind of actor, and an agent key can never do more than the person who created it. People join only through single-use, expiring, role-bound invite links (email delivery is a later, pluggable add-on), and every membership change is audited.

## Motivation
- **Problem.** `defaultScopes()` returns `["*"]` for every human (`packages/agent-runtime/src/policy.ts`), the REST API's only gate is `peopleOnly` (any person may do anything), and any person may approve any agent request (`routes/approvals.ts`). With `signUp: "first-user"` the owner is the only safe account, and `open` hands the site to anyone. The Better Auth `organization` and `admin` plugins are loaded and their tables exist (migration `0002_auth`), but nothing reads them.
- **Who is affected.** Publishers with a team (the gap analysis rates roles and invites P0, rows 43–44); approvers, who today cannot be told apart from writers; owners whose agents' power should follow the person who runs them.
- **Why now.** Approvals (ADR-0014), modes (ADR-0015) and elevations (ADR-0016) assume "a person" is trusted with everything. Every new governed surface (taxonomy governance, menus, assets) widens that hole. Fixing the actor model before Cloud multi-tenancy is cheaper than after.

## Proposal

### 1. Scopes: a small lattice, two classes
Scopes keep the `area:verb` form. This RFC adds **own-limited variants** and **person-only scopes**. A stronger scope implies the weaker ones (`implies`), and `*` implies everything.

| Scope | New | Class | Implies | Meaning |
|---|---|---|---|---|
| `site:read` | | tool | | Sites, snapshots, diffs, redirects, taxonomies (read) |
| `content:read` | | tool | | Pages, entries, terms (read, including drafts) |
| `preview:create` | | tool | | Previews and signed preview links |
| `content:draft:own` | ✓ | tool | | Create entries; change or delete **own, never-published** entries; status only `draft`/`review` |
| `content:write:own` | ✓ | tool | `content:draft:own` | Create entries; change or delete **own** entries in any status |
| `content:write` | | tool | `content:write:own` | Any entry, any page, term descriptions (`update_term`) |
| `site:publish:own` | ✓ | tool | | Publish when every publicly visible change is the caller's own (§4) |
| `site:publish` | | tool | `site:publish:own` | Publish anything |
| `site:rollback` | | tool | | Roll back the live pointer |
| `site:write` | | tool | | Structure in the graph: taxonomies, term governance, redirects, menus (RFC-0003) |
| `asset:upload` | ✓ | tool | | Upload assets and edit own uploads (RFC-0004) |
| `asset:manage` | ✓ | tool | `asset:upload` | Replace, edit and delete any asset (RFC-0004) |
| `audit:read` | ✓ | person | | Every site's Activity (others see only their own rows) |
| `site:settings` | ✓ | person | | The Site node (name, locales, theme, **domains**), `tags-to-terms` migration |
| `members:invite` | ✓ | person | | Create and revoke invites (rank rule, §3) |
| `members:manage` | ✓ | person | `members:invite` | Change roles, remove members, see emails |
| `agents:manage` | ✓ | person | | See every agent key; revoke keys and end elevations of others' keys |

- **Tool scopes** can be held by agent keys and are what MCP tools require. **Person-only scopes** are never stored on a key and never satisfy a tool (I7).
- The asset scope names are placeholders until RFC-0004 settles them. The ability column of the permission matrix (§2) is normative, the names are not.
- Tools lower their requirement where an own variant applies. `propose_term` changes from `content:write` to `content:draft:own`. Every key that works today keeps working, because `content:write` implies the variant.
- Line between Editor and Administrator: what lives **in the graph and is undone by rollback** (content, pages, taxonomy, redirects, menus) is Editor. The exception is the Site node, because it carries domains. What lives **outside the graph** (members, keys of others, settings, domains) is Administrator.

### 2. Roles

#### 2.1 Role → scopes
| Scope | Contributor | Author | Editor | Administrator | Owner |
|---|:-:|:-:|:-:|:-:|:-:|
| `site:read`, `content:read`, `preview:create` | ✓ | ✓ | ✓ | ✓ | `*` |
| `content:draft:own` | ✓ | (implied) | (implied) | (implied) | `*` |
| `content:write:own` | | ✓ | (implied) | (implied) | `*` |
| `content:write` | | | ✓ | ✓ | `*` |
| `site:publish:own` | | ✓ | (implied) | (implied) | `*` |
| `site:publish`, `site:rollback`, `site:write` | | | ✓ | ✓ | `*` |
| `asset:upload` | ✓ | ✓ | (implied) | (implied) | `*` |
| `asset:manage` | | | ✓ | ✓ | `*` |
| `audit:read` | | | ✓ | ✓ | `*` |
| `members:invite` | | | ✓† | (implied) | `*` |
| `site:settings`, `members:manage`, `agents:manage` | | | | ✓ | `*` |
| Owner-only: transfer ownership | | | | | ✓ |
| Highest key mode (§5.2) | `edits` | `auto` | `auto` | `auto` | `auto` |

† Editors invite Contributors and Authors only (Ghost: Editors "invite new Contributors and Authors"). This is open question 1. Without it, `members:invite` starts at Administrator.

Administrator holds every non-wildcard scope. The Owner holds `*`, so a future scope reaches the Owner without a migration, and is the only one who can transfer ownership. Neither difference reaches keys: `*` is never grantable to a key (`ALL_SCOPES` excludes it today).

#### 2.2 Permission matrix
"Own" is defined in §4. "Request" means the call files an approval that someone with the full power decides (§6).

| Ability | Contributor | Author | Editor | Admin | Owner |
|---|---|---|---|---|---|
| Create an article | ✓ (draft/review) | ✓ | ✓ | ✓ | ✓ |
| Edit own article: never published / published | ✓ / – | ✓ / ✓ | ✓ | ✓ | ✓ |
| Edit others' articles; change `author` | – | – | ✓ | ✓ | ✓ |
| Set status `review` / `published`, `archived` | ✓ / – | ✓ (own) | ✓ | ✓ | ✓ |
| Delete own unpublished / own published / others' | ✓ / – / – | ✓ / ✓ / – | ✓ | ✓ | ✓ |
| Pages: create, edit, delete | – | – | ✓ | ✓ | ✓ |
| Publish own-only change set / anything | – / request | ✓ / request | ✓ | ✓ | ✓ |
| Rollback | – | – | ✓ | ✓ | ✓ |
| Assign existing terms; propose tags | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create categories, approve proposed terms, rename / merge / retire / move terms, taxonomies | – | – | ✓ | ✓ | ✓ |
| Redirects; menus (RFC-0003) | – | – | ✓ | ✓ | ✓ |
| Assets: upload, edit own / manage all (RFC-0004) | ✓ / – | ✓ / – | ✓ | ✓ | ✓ |
| **Approve agents' requests** (§6) | own keys' requests the role could do itself | same, incl. own-only publishes | all but elevations of others' keys | same | same |
| Agent keys: create own (⊆ own scopes) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Agent keys: change mode, elevate (own keys, ≤ cap) | ✓ (≤ edits) | ✓ | ✓ | ✓ | ✓ |
| Agent keys of others: list, revoke, end elevation | – | – | – | ✓ | ✓ |
| Activity: own rows / all | ✓ / – | ✓ / – | ✓ / ✓ | ✓ | ✓ |
| Site settings, domains (Studio/REST), tags→terms migration | – | – | – | ✓ | ✓ |
| Members: see names and roles / emails | ✓ / – | ✓ / – | ✓ / – | ✓ | ✓ |
| Invite | – | – | Contributor, Author† | up to Administrator | up to Administrator |
| Change role, remove | – | – | – | non-Owner members | everyone else |
| Transfer ownership (to an Administrator) | – | – | – | – | ✓ |
| Deploy, `push`/`pull` | operator (deployment token), outside roles | | | | |

Deploy stays with the deployment token (`/api/admin`, `cloudhal deploy`), which is operator power, not a member role. Studio has no deploy action. A future one would be Owner-only.

### 3. Members, rank and ownership
- **Rank:** Owner > Administrator > Editor > Author > Contributor.
- **Rank rule** (I4):
  - Nobody changes their own role.
  - An Administrator may change, remove and invite any non-Owner role, including other Administrators (Ghost parity; open question 4).
  - An Editor may invite only Contributors and Authors (†).
  - Nobody can invite or assign `owner`.
- **Exactly one Owner** (I2). The Owner cannot be removed, demoted or leave. Ownership moves only by transfer:
  - `POST /api/members/transfer-ownership {userId, password}`. Only the Owner may call it, the target must already be an **Administrator** (as in Ghost), and the password must be re-entered.
  - One guarded `batch()` on `member` sets the target's role to `owner` and the caller's to `administrator`. Each statement is guarded on both rows' current roles, so a concurrent change voids the whole operation (AGENTS.md rule 4).
  - Audited as `member.transfer-ownership`.
  - Better Auth also allows several owners and comma-separated role lists. Cloudhal stores exactly one role name per member and refuses lists.
- **Lockout.** An Owner who loses access is recovered by the operator, `cloudhal owner transfer --to <email>` with the deployment token (open question 7). The operator is already root for site data.
- **Removal.** Removing a member (Administrator+, never the Owner) does the following, in this order:
  1. Deletes the member row. Per-request resolution (I1) makes this effective at once.
  2. Revokes all their sessions (`auth.api.revokeUserSessions`).
  3. Disables their agent keys (`enabled = false`; kept for audit, deletable).
  4. Cancels their pending invites.
  5. Denies their agents' pending approval requests, decided by `system` with the reason "member removed".

  The user row stays, because activity and `author` fields reference it. A sign-in hook refuses users without a membership ("Your access was removed. Ask an administrator for a new invite."). A re-invite restores access (§7.4).

### 4. Ownership: what "own" means
- **Today**, `ownerOf(entry)` is the person behind `entry.author`. For a `human` actor, that is the user it names. For an `agent` actor, it is the person whose key the agent used (the key's `referenceId`, I9). For `system`, there is no owner.
- **The gap:** if an agent's key has been deleted, the link from an agent author back to a person is lost. §8 adds `Actor.onBehalfOf` so that agent-written entries carry their person.
- **With bylines** (the RFC-0002 follow-up, `authors: Id[]` pointing at Author nodes), `ownerOf` also includes `Author.userId` for every byline that links to a staff user. "Who changed it" (`author`) and "who wrote it" (`authors`) both confer ownership, so a co-author can edit a shared post.
- **Ownership fields are server-controlled** (I9):
  - On create, `author` is the caller. A body-supplied `author` is honoured only for full `content:write` (Editors may credit someone else, e.g. imports). Today REST `POST /entries` trusts the body.
  - On update, an own-limited caller cannot change `author`, and any `authors` change must keep the caller in the list. Nobody can claim or shed ownership through an edit.
- **Draft-own** (Contributor) additionally requires that the entry was never published (`publishedAt` absent, status `draft` or `review`). Once an Editor publishes it, it is read-only to the Contributor, as in Ghost.
- **Own-only publish.** A change set is the live snapshot → target diff: `pendingChanges` for MCP, or the snapshot pair for REST `POST /snapshots/:id/publish`. It is **own-only** for person P when every *publicly visible* change is an entry P owns:
  - added, changed or removed entries whose status is `published` before or after count;
  - entries that are draft/review on both sides are invisible to readers and ignored;
  - any page, Site, taxonomy, term, redirect, menu or asset change makes it not own-only.

  In `auto` mode an Author's agent must pass this check **and** the low-risk rule (ADR-0015).
- Why a change-set rule rather than per-entry publish: Cloudhal publishes by moving one live pointer per site (ADR-0004, ADR-0014), not per post. Per-entry publish needs partial snapshots (Alternatives).

### 5. Agents follow their person

#### 5.1 Scopes
- **At creation:** the requested scopes must be a subset of `narrow(…, roleScopes(creator))`. The default per mode (`scopesForMode`) is narrowed first, so a Contributor's default `edits` key gets `site:read, content:read, preview:create, content:draft:own, asset:upload`.
- **On every call:** `resolvePrincipal` reads the key's `referenceId` → member role (one indexed read), and the effective scopes are `narrow(keyScopes, roleScopes(creatorNow))`:
  ```ts
  /** Keeps each key scope the role holds; else the strongest variant of it the role holds; else drops it. */
  export function narrow(keyScopes: Scope[], roleScopes: Scope[]): Scope[];
  // narrow(["content:write","site:publish"], AUTHOR) → ["content:write:own","site:publish:own"]
  ```
  A creator who is no longer a member makes the key fail authentication (401). There is no window where a demoted person's agent keeps the old power, because nothing has to run for the narrowing to apply.

#### 5.2 Modes and elevation
- `modeCap(role)` is `edits` for a Contributor (no publish power, so `auto` would be meaningless) and `auto` otherwise. `bypass` stays local only (ADR-0015).
- Creating a key, `PATCH` mode, granting an elevation, and approving an elevation request all refuse a mode above the creator's cap (400 `mode_above_role`).
- **Elevation is a delegation by the key's creator.** Only the creator grants it, directly or by approving the agent's `request_elevation`, as today: the approve route already requires that the key belongs to the approver. Administrators may *end* elevations and revoke others' keys (`agents:manage`), but cannot grant them. Agents' requests are notified to the creator only (ADR-0016).

#### 5.3 Demotion
A demotion is applied in two layers:
- **Immediately, at runtime:** §5.1 narrowing applies on the next call.
- **Persisted, in the same request as the role change:** each of the person's keys is rewritten. Stored scopes become `narrow(stored, newRole)` and the mode becomes `min(mode, cap)`. An elevation above the cap is ended. Each rewrite is audited as `agent-key.narrow` with `{keyId, scopes: {from, to}, mode: {from, to}, elevationEnded}`.

A later promotion **does not widen keys back**: promotions never silently empower agents. The runtime layer covers the gap between the role write and the key rewrites, since D1 has no transactions.

#### 5.4 Approvals filed by the person's agents
These requests are re-evaluated when redeemed, because the tool runs through `runTool` with the current principal. A request approved before a demotion fails at redemption if the agent no longer holds the scope.

### 6. Who may decide an approval
`canDecide(person, request)` holds if:
1. `person` is a member and, for a request filed by a person (cause `role`, below), is not its author. There is no self-approval between people.
2. For `request_elevation`: the person created the key and `request.mode ≤ modeCap(person.role)`.
3. For every other tool: the person could make the same call now. `PolicyEngine.evaluate(personPrincipal, tool)` must not deny on scopes, and the own limit holds against the current state:
   - a publish must be own-only for *the approver*;
   - an entry tool's target must be owned by the approver.

   Approval gates are ignored for this check (the approver is the gate).

Consequences:
- A Contributor can never approve a publish, a rollback, a delete of others' work, or taxonomy governance.
- An Author can approve their own agent's publish only when it is own-only.
- Editors and above decide everything except elevations of keys they did not create.
- Approving one's own agent's request stays allowed, so solo owners keep working. Four-eyes is open question 3.

Denying requires the same rights, plus the key's creator may always deny their own agent's requests.

**Requests by people.** A person whose call needs more than their role (an Author publishing a change set that is not own-only) gets a request instead of a 403. The request has a new cause, `role`:
- It is filed in the `approvals` table with the person as actor and bound to `state_hash`, like an agent's.
- Approving it **executes** the publish with the approver's rights at the approved state, then marks the request `consumed`, the same pattern as elevation grants. If the site changed, the approve call returns 409 and the approver can publish the current state themselves.

`GET /approvals` returns `canDecide` per item. Everyone sees requests from their own keys and their own person-requests, plus those they can decide.

### 7. Invites

#### 7.1 Token
- **Format:** `chinv_` + 43 base64url characters, from 32 bytes of `crypto.getRandomValues` (256 bits). The prefix lets secret scanners match it.
- **Storage:** only `SHA-256(token)` is stored, as hex in `invitation.tokenHash` (unique index). The plaintext is returned exactly once, in the create response.
- **Link:** `<studio origin>/invite#chinv_…`. The token travels in the **fragment**, so it never reaches server logs, `Referer` headers or link-unfurl bots. Studio strips it with `history.replaceState` and sends it in POST bodies only. No GET consumes or reveals an invite.
- **Why not Better Auth's invitation id as the secret:**
  - it sits in plaintext in the database;
  - it is listed by org endpoints;
  - and, in our sign-up-by-invite flow, it would let anyone who can list invitations create the invited account, with the invited role.
- **Expiry:** the default is 7 days, the range 1 hour to 14 days. Administrator invites are capped at 72 hours. Better Auth's own default is 48 hours (`invitationExpiresIn`); we set `expiresAt` ourselves.
- **Single use:** `accept` claims the invite with one guarded statement:
  ```sql
  UPDATE invitation SET status='accepted', acceptedAt=?
   WHERE tokenHash=? AND status='pending' AND expiresAt > ?
  ```
  `changes = 1` wins. Anything else answers **410** `invite_gone`.
- **Binding:** the invite fixes both the **role** and the **email** of the account. The invitee can neither pick another email nor get another role.
- **Revocation:** `DELETE /api/invites/:id` sets `status = 'canceled'`. Re-inviting an email cancels its pending invite (`cancelPendingInvitationsOnReInvite` semantics). Removing the inviter cancels their pending invites.
- **Limits:** at most 50 pending invites per deployment, and 20 creations per inviter per hour. `inspect` and `accept` are limited to 10 per minute per IP, using Better Auth's rate-limit table (migration 0005).

#### 7.2 Delivery
- **Baseline: link.** The inviter copies the URL from the create response. Such accounts start with `emailVerified = false`: whoever holds the link is the invitee, but the address itself is unproven.
- **Optional email delivery**, through a pluggable sender passed to `createApi`:
  ```ts
  export interface MailSender {
    readonly id: string; // "resend" | "cloudflare-email" | …
    send(message: { to: string; subject: string; text: string; html?: string }): Promise<void>;
  }
  // ApiDeps.mail?: MailSender  → /api/instance reports invites.delivery: ["link"] | ["link", "email"]
  ```
  With a sender, `delivery: "email"` mails the link, does **not** show it to the inviter, and sets `emailVerified = true` on accept. "Copy a link instead" stays available.

  The same sender later serves password reset and email notifications (ADR-0016 follow-up). Better Auth's `sendInvitationEmail` is not used, because it hands out the invitation id, not our token.

#### 7.3 Accept: new account
1. Studio `/invite` calls `POST /api/invites/inspect {token}`. The answer is `{email, role, inviterName, deploymentName, expiresAt, account: "new" | "existing"}`; nothing is consumed.
2. The invitee enters a name and a password, then `POST /api/invites/accept {token, name, password}`. The server:
   1. refuses with 409 `signed_in_as_other` when a session for another user exists. There is no silent session switch, which also blocks login CSRF;
   2. claims the invite (§7.1);
   3. creates the user with the admin plugin's server-side `auth.api.createUser`. It needs no session, and `disableSignUp` blocks only the public sign-up endpoint (`api/routes/sign-up.mjs`), so sign-up stays closed;
   4. inserts the `member` row, guarded on the invitation being accepted by this user;
   5. signs the user in;
   6. audits `member.invite-accept`.

   If user creation fails after the claim, the invite returns to `pending` (guarded on `acceptedUserId IS NULL`). A crash in between leaves an "accepted, no account" invite that Members shows, so an Administrator can re-invite.

#### 7.4 Accept: existing account
This covers a removed person invited back, and Cloud later. The flow is the same, with `{token, password}`: the server verifies the password the way sign-in does, instead of creating a user.

#### 7.5 Sign-up modes
- `first-user`: unchanged. The first account needs the setup token, and its `member` row is created as `owner` in the same request.
- `closed`: no public sign-up at all.
- `open`: dev and demos only. New accounts join as Contributor (open question 9).

### 8. Contracts
No JSON Schema changes are needed: roles, members and invites live in Better Auth tables. One optional, additive field is proposed for the implementation phase, after the RFC-0003 and RFC-0004 contract changes merge. Both generators accept it under the schema subset.
```diff
 // common.schema.json#/$defs/Actor
   "properties": {
     "kind": { "$ref": "#/$defs/ActorKind" },
     "id": { "$ref": "#/$defs/Id" },
-    "name": { "type": "string", "maxLength": 200 }
+    "name": { "type": "string", "maxLength": 200 },
+    "onBehalfOf": {
+      "$ref": "#/$defs/Id",
+      "description": "Agents only: the person (user_…) whose key the agent used. Set by the server, never by the caller."
+    }
   }
```
- **Fixtures:** valid agent actor with `onBehalfOf`; invalid with `onBehalfOf: 42`.
- **Fallback:** without the field, ownership falls back to the key's `referenceId` (§4).

### 9. Invariants and enforcement
| # | Invariant | Enforced in | Proven by |
|---|---|---|---|
| I1 | A person's scopes come from their single `member` row, read on every request. No row means no scopes: 403 everywhere except `/api/me`, `/api/auth/*` and the invite endpoints. Humans without a membership source (no auth configured, local stdio) keep `*`. | `resolvePrincipal` (`packages/api/src/auth.ts`); `defaultScopes` keeps `*` only for `system` and auth-less servers | API suite (sqlite + D1) |
| I2 | Exactly one Owner per deployment at all times. | members routes; transfer batch guards; migration | conformance test incl. concurrent transfer |
| I3 | Membership changes only through Cloudhal routes. Better Auth's `/api/auth/organization/*` and `/api/auth/admin/*` answer 404 over HTTP and are used only server-side. | auth mount in `app.ts` | route test |
| I4 | Rank rule (§3). | `canManage(actor, target, role)` in agent-runtime | table test |
| I5 | Key scopes ⊆ `narrow(creator role)` at creation, and effective scopes = `narrow(key, creator role now)` on every call. A key whose creator is not a member is refused. | `agentKeys.create`, `resolvePrincipal` | policy + API tests |
| I6 | Key mode, elevations and granted elevation requests ≤ `modeCap(creator role)`. Only the creator grants. Demotion persists the narrowing. | `agentKeys.setMode/elevate`, approvals route, members route | tests |
| I7 | Person-only scopes are never stored on keys and never satisfy a tool. | `KEY_SCOPES` (replaces `ALL_SCOPES` for keys), `PolicyEngine` | policy test |
| I8 | Deciding an approval requires `canDecide` (§6). People do not approve their own person-requests. | approvals route | tests per role × tool |
| I9 | Own-limited writes need `ownerOf(target) ∋ caller's person`. Ownership fields are immutable for own-limited callers. Draft-own also needs a never-published, draft/review entry. | `Decision.allow.limit` checked by REST handlers and MCP tool handlers through one helper, `assertOwnLimit` | shared suite |
| I10 | Own-only publish (§4). Otherwise the call becomes a request (cause `role`). | publish paths (REST and MCP) | tests |
| I11 | Invite tokens: 256-bit, stored hashed, shown once, single use, expiring, revocable, role- and email-bound. No GET consumes them. | invites routes | tests incl. replay and expiry |
| I12 | Nobody invites a role they could not assign. `owner` is never invitable. | invites route (`canManage`) | table test |
| I13 | Removal: delete membership → revoke sessions → disable keys → cancel invites → deny pending agent requests. | members route | test |
| I14 | Every membership event is audited with structured `input`. Tokens and hashes never appear in audit rows, logs or server-bound URLs. | members and invites routes | test greps audit rows |
| I15 | REST is default-deny: every `/api` route declares its requirement in `ROUTE_SCOPES`, and a test fails for any undeclared route. | `packages/api/src/scopes.ts` | route enumeration test |
| I16 | Studio gating follows the server's `can` map. It is cosmetic, and the server decides. | `useCan()` | Studio tests |

The policy engine changes minimally:
```ts
export type Decision =
  | { kind: "allow"; limit?: OwnLimit }
  | { kind: "deny"; reason: string; code?: "missing_scope" | "mode" | "skill" }
  | { kind: "approval-required"; reason: string; cause: ApprovalCause; autoApprove?: "low-risk-publish" };
export type OwnLimit = { level: "own" | "draft"; target: "entry" } | { level: "own"; target: "changeset" };
export type ApprovalCause = "tool" | "destructive" | "skill" | "manual-mode" | "role";
// ToolPolicy gains `own?: "entry" | "changeset"`: the own variants of its scope satisfy it with a limit.
```

### 10. Surfaces

#### 10.1 REST
`ROUTE_SCOPES` replaces "any person = `*`". `peopleOnly` stays: agents remain refused on REST.

| Route | Requirement |
|---|---|
| `GET /api/sites`, `/sites/:id`, snapshots list/get/diff, redirects/taxonomies GET | `site:read` |
| `PUT /api/sites/:id` | `site:settings` |
| pages, entries, terms `GET` | `content:read` |
| pages `POST`/`PUT`/`DELETE` | `content:write` |
| entries `POST`/`PUT`/`DELETE` | `content:draft:own` + `assertOwnLimit` |
| `POST /snapshots` | `content:draft:own` |
| `POST /snapshots/:id/publish` | `site:publish:own` (own-only, else 202 with a `role` request) |
| `POST /snapshots/:id/rollback` | `site:rollback` |
| terms `POST` | tag (proposed for own-limited callers): `content:draft:own`; category or active term: `site:write` |
| terms `PUT` | `content:write` |
| term governance (`rename`, `merge`, `retire`, `parent`, `visibility`, `review`), taxonomies writes, redirects writes, menus writes | `site:write` |
| `POST /migrations/*` | `site:settings` |
| `POST /preview-links` | `preview:create` |
| `GET /activity` | `audit:read`, else filtered to the caller's own and own keys' rows |
| approvals `GET` / decide | member / `canDecide` |
| `/api/agent-keys` (own keys) | member; `?all=1`, revoke or end elevation of others' keys: `agents:manage` |
| `/api/instance`, `/api/skills`, `/api/notifications` | member |

New routes, all audited:
- `GET /api/me` adds `{role, scopes, can: Record<Ability, boolean>}`.
- `GET /api/members` returns `{userId, name, role, joinedAt, email?}`; `email` requires `members:manage`.
- `PATCH /api/members/:userId {role}` (`members:manage` + rank rule) → `member.role`, followed by the key narrowing of §5.3.
- `DELETE /api/members/:userId` (`members:manage`) → `member.remove`.
- `POST /api/members/transfer-ownership {userId, password}` (Owner) → `member.transfer-ownership`.
- `GET /api/invites` and `POST /api/invites {email, role, expiresInHours?, delivery?}` (`members:invite`) → `{invite, url?}` → `member.invite`.
- `DELETE /api/invites/:id` → `member.invite-revoke`.
- `POST /api/invites/inspect {token}` and `POST /api/invites/accept {token, name?, password}` are public, rate-limited and JSON-only (415 otherwise) → `member.invite-accept`.
- `/api/instance` reports `roles {names, scopes, modeCaps}` and `invites {defaultHours, minHours, maxHours, delivery}`, the same pattern as `agentModes`, so Studio applies the server's rules.

**Audit rows** have `site_id = NULL` and structured `input`:
- `member.invite`: `{inviteId, email, role, expiresAt, delivery}`;
- `member.invite-revoke`: `{inviteId}`;
- `member.invite-accept`: `{inviteId, role, invitedBy}`;
- `member.role`: `{userId, from, to}`;
- `member.remove`: `{userId, role, keysDisabled, invitesCanceled}`;
- `member.transfer-ownership`: `{from, to}`;
- `agent-key.narrow` (§5.3).

`GET /api/activity` (Administrator+) shows these deployment rows.

#### 10.2 MCP
- **Human sessions** on `/mcp` get their role's scopes through the same `resolvePrincipal`.
  - Elicitation still serves people (ADR-0014 §3), but only for calls their role allows.
  - A call needing more (cause `role`) files an out-of-band request like an agent's, instead of eliciting the person's own client.
- **Agents** get narrowed scopes (§5.1).
  - `get_mode` adds `person: {role}` and the effective `scopes`.
  - The server instructions say whose key it is and that publishes beyond the person's role wait for an Editor.
  - Tool handlers apply `Decision.allow.limit`.
  - `tools/list` stays the full, deterministic list (ADR-0004). Denials carry `code: "missing_scope"`.

#### 10.3 Studio (brief; `kumo-design` + `studio-ui` + DESIGN.md)
- **Members** (account surface › Settings › Members, §2a list template). It has:
  - a table with initials avatar, name, email (Administrator+), a role `Badge`, joined `RelativeTime` and a row `DropdownMenu` (Change role, Remove, Make owner);
  - **Invite** as a `LayerDialog` in two steps. The first step takes the email `Input`, a role `Radio.Group appearance="card"` with one line per role (roles above the inviter are absent) and an expiry `Select`. The second, like the agent-key reveal, shows an alert `Banner` "You won't see this link again", the link in `ClipboardText`, and the expiry;
  - a **Pending invites** `SectionCard` with email, role, inviter, expires and Revoke;
  - **Transfer ownership** as a `DeleteResource`-style destructive flow with a password field, offered only on Administrator rows to the Owner.
- **Role badges** appear in the user menu, Members, Activity and Approvals (`ActorBadge` adds the role).
- **`/invite`** uses the auth template (§2e): who invited you, as what, for which email (read-only), and the name and password fields.
- **Gating** uses `useCan(ability)` from `/api/me`:
  - Sidebar items stay **disabled with a tooltip, never hidden** (DESIGN.md §3).
  - In-context actions are disabled with a `Tooltip` naming the role that can do it.
  - Publish becomes "Submit for review" for Contributors and "Request publish" when an Author's change set is not own-only.
  - Approvals shows Approve only where `canDecide`, otherwise "Waiting for an Editor".
  - Key dialogs show only modes and scopes within the person's role.
  - A 403 from the server is still handled everywhere, because UI gating is cosmetic.
- All strings go through `useT()` with `en.ts` and `tr.ts` keys.

### 11. Storage
**Mapping: Better Auth's organization plugin, one organization per deployment.**
- The `organization`, `member` and `invitation` tables exist already, and the plugin brings last-owner checks and role hooks (`beforeUpdateMemberRole`, `beforeCreateInvitation`, `beforeAcceptInvitation`).
- Cloud multi-tenancy becomes "one org per tenant" without moving data.
- The five roles are registered with `createAccessControl`, so the plugin accepts the role names. Its statements cover only `organization`, `member`, `invitation` and `ac`. Site permissions stay in Cloudhal's `ROLE_SCOPES`, the single source for the policy engine, REST, MCP and Studio.

**Migration `00NN_roles`** (the next free number when implemented; RFC-0003 and RFC-0004 may take 0012 and 0013). Additive; it describes the change and implements nothing here:
1. Adds `invitation` columns, declared as `organization({ schema: { invitation: { additionalFields } } })` so the adapter knows them; the DDL comes from `getMigrations().compileMigrations()`, per 0002's rule:
   - `tokenHash text` with a unique index;
   - `delivery text` (`link` | `email`);
   - `acceptedUserId text`, `acceptedAt date`;
   - `canceledBy text`, `canceledAt date`.
2. Inserts the deployment organization (`id` and `slug` `deployment`, name from the first site, else "Cloudhal") when none exists.
3. Inserts `member` rows: the earliest user (`createdAt`, then `id`) becomes `owner`. Any other existing users (only possible with `open` sign-up) become `administrator`: the closest role to their former `*` that keeps I2.
4. Changes no keys. Effective key scopes are computed (§5.1), and an Owner's or Administrator's keys narrow to themselves.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Own `staff` table instead of the org plugin | Full control; no fencing of plugin endpoints | Re-implements membership, invites and owner rules; redone for Cloud | Tables and logic already exist in 1.7.7; Cloud wants orgs |
| Admin plugin `user.role` as the role | One column, simple | Global, not tenant-aware; the same role unlocks impersonate/ban/set-role endpoints | Couples staff roles to the most dangerous endpoints |
| Better Auth access control as the permission truth | One library decides | Two permission languages; agents and MCP use scopes; the plugin cannot judge ownership or change sets | Scopes stay the truth; the plugin stores membership |
| Custom roles now (`dynamicAccessControl`) | Flexible | UI, review and test surface; Ghost's five cover publishers | Later, as named scope sets |
| Better Auth invitation id as the link secret | No new column | Plaintext in the DB, listed by org endpoints; with sign-up by invite it escalates | Hashed token (§7.1) |
| Email-only invites | Familiar | No mail infrastructure yet | Link baseline, email pluggable |
| Per-entry publish for Authors | True Ghost parity | Needs partial snapshots; breaks "one live pointer" | Own-only change set + request |
| Revoke a demoted person's keys | Simple | Breaks working agents that fit the new role | Narrow at runtime and persist |
| Revoke sessions on demotion | Familiar | Unneeded when the role is read per request | Only on removal |
| Per-site roles now | Fine-grained | No per-site authorization exists yet; doubles the matrix | Deployment-wide now; open question 10 |

## Compatibility & migration
- **Contracts:** unchanged; `schemaVersion` is unaffected. The optional `Actor.onBehalfOf` (§8) is additive.
- **Data:** the migration is additive. The single existing user becomes Owner with `*`, so nothing they can do changes. Keys keep their stored scopes and modes; for an Owner's keys the effective scopes are unchanged.
- **Behaviour changes:**
  - New `open`-mode sign-ups are Contributors.
  - REST `POST /entries` ignores a body `author` without full `content:write`.
  - `propose_term` needs only `content:draft:own`.
  - Approvals show who may decide.
- **Rollout:**
  1. agent-runtime: lattice, `narrow`, roles, `Decision.limit`, cause `role`;
  2. migration and `resolvePrincipal`;
  3. `ROUTE_SCOPES`, approvals `canDecide`, own limits in REST and MCP;
  4. members and invites routes, the audit rows, the fence on plugin endpoints;
  5. Studio;
  6. threat model and ADR-0018.

  Steps 1–3 ship together: until then, every person is still the Owner.
- **Rollback:** older code ignores `member` and `invitation.tokenHash`. Everyone is `*` again, which is a security regression but loses no data. Invites issued meanwhile stop working.

## Security & policy impact
- **New scopes:** the own variants and the person-only scopes (§1). New approval cause `role`. The approval decision becomes role-bound (§6).
- **Privilege escalation via keys:**
  - Mint-time subset (I5) and per-call narrowing (I5).
  - A mode cap (I6), and elevation granted only by the creator.
  - Person-only scopes never on keys (I7). Keys cannot mint keys (agents are refused on REST).
  - An agent's ownership is its person's, so an Author's agent cannot publish others' work.
- **Invite-link leakage:**
  - Short, single-use, revocable, role- and email-bound links. The token is hashed at rest and kept in the URL fragment.
  - `inspect` shows the bound email, so a wrong recipient sees the link is not theirs.
  - Accepts are audited and shown to the inviter, through `/api/notifications` `member-joined`, derived from state like ADR-0016.
  - Administrator invites expire within 72 hours.
  - Residual risk: a link pasted into a shared channel grants that role to whoever uses it first. That is accepted for link delivery and documented in the dialog.
- **CSRF on accept:**
  - The `/api/*` same-origin check covers the invite routes (they are not under `/api/auth/`).
  - JSON-only bodies force a preflight.
  - With a different session present, accept refuses.
  - Role change, removal and transfer are cookie-authenticated POST/PATCH/DELETE under the same check, and transfer re-checks the password.
- **Demoted person:**
  - Sessions stay, but their power drops on the next request (I1).
  - Keys are narrowed at once at runtime and then persisted, and elevations above the cap end (§5.3).
  - Requests their agents already filed are re-evaluated at redemption.
  - **Removal** revokes sessions, disables keys, cancels invites and denies pending requests (I13).
- **Threat model edits** (with implementation):
  - The Principals table gets five role rows instead of "Owner / person: everything".
  - Promise 1 adds "an agent never exceeds the person whose key it uses".
  - New promise: "people stay inside their role; the server decides, never the UI".
  - Promise 6 adds "after the owner, only invite links".
  - The accepted risk "No per-site authorization" now reads "roles are deployment-wide".
  - New accepted risks: link invites leave the email unverified, and Administrators can demote each other.
- **Tenant isolation:** unchanged now. One org per deployment. In Cloud, `org_id` scopes membership; sites gain an org binding in a later RFC.

## Open questions (with recommendations)
1. **May Editors invite?** *Recommend yes, Contributors and Authors only* (Ghost parity; a newsroom editor manages writers).
2. **Can Contributors and Authors read others' drafts?** *Recommend yes* (`content:read` for all staff; collaborative newsrooms, previews and bylines need it). Per-entry privacy later.
3. **Four-eyes: may a person approve their own agent's request?** *Recommend yes by default* (solo owners), with a later deployment setting `approvals.requireOtherPerson`.
4. **May Administrators demote or remove other Administrators?** *Recommend yes* (Ghost parity), audited, with a notification to the affected person.
5. **Invite expiry.** *Recommend a 7-day default, 1 hour to 14 days, Administrator invites ≤ 72 hours.*
6. **Password reset without email.** *Recommend an Administrator-issued one-time reset link* using the invite token machinery (`chrst_`, 1 hour, single use, audited), and email reset once a `MailSender` exists.
7. **Owner lockout.** *Recommend `cloudhal owner transfer --to <email>`* with the deployment token: the operator is already root, and this adds no new power.
8. **Menus: Editor or Administrator?** Ghost keeps navigation under Admin settings. *Recommend Editor (`site:write`)*: menus are graph nodes, snapshotted and undone by rollback (RFC-0003).
9. **Role for `open` sign-ups.** *Recommend Contributor.*
10. **Per-site roles and Cloud.** *Recommend one org per tenant*, with per-site overrides as a small `site_member (site_id, user_id, role)` table later, not Better Auth teams. The roles stay the same names and scopes.
11. **When does `Actor.onBehalfOf` land?** *Recommend in the implementation PR*, after RFC-0003 and RFC-0004 merge their contract changes, with the `referenceId` fallback for older rows.
12. **Should Administrators grant elevations on others' keys?** *Recommend no*: an elevation delegates the creator's own judgement. Administrators can end elevations and revoke keys.
