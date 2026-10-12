# @cloudhal/comments

First-party reader comments for Cloudhal sites ([RFC-0007](../../docs/rfcs/0007-reader-comments.md), [ADR-0022](../../docs/adr/0022-reader-comments.md)). Guest comments are held for moderation, live in D1 **outside the site graph**, are server-rendered into the cached article page and purged by tag (`cloudhal-comments-<nodeId>`) within the Free-tier purge budget. Bots pay with a first-party proof of work; Turnstile is opt-in.

Everything here is **Worker-safe**: no Node-only import at any entry. The stored and returned record is the `Comment` contract of `@cloudhal/core-contracts`; no API returns an email address, an IP hash or a challenge outside the `commenter` accessors (invariant C1).

| Entry | What |
|---|---|
| `@cloudhal/comments` | Settings model and `threadState`, normalising, content rules, linkify, proof of work, the submission/report/challenge pipelines and their answers, keys and hashes, isolate limits, purge planner, retention plan. No storage dependency. |
| `@cloudhal/comments/sql` | `SqlCommentStore` over `SqlDriver` (SQLite locally and on Node, D1 on Cloudflare) for migration `0016_comments`. |
| `@cloudhal/comments/client` | The browser sources (Node build input only): the comments module (`/_cloudhal/c.<hash>.js`, ≤ 4 KB gzipped) and its proof-of-work worker (`/_cloudhal/cw.<hash>.js`, pure-JS SHA-256, ≤ 1 KB), built by the `cloudhal()` integration; endpoint names and budgets. |
| `@cloudhal/comments/testing` | `describeCommentStoreConformance`, `describeCommentPipelineSuite`, `countingDriver`, `expectContractComment` (vitest). |
| `@cloudhal/comments/fixtures/comment-text.json` | The shared link-rule fixture (`parseCommentText` input → paragraphs), for the renderer and Studio's blocks. |

## Settings and thread state (§4.5)

```ts
import { applySettingsInput, defaultCommentSettings, threadClosesAt, threadState } from "@cloudhal/comments";

const settings = await store.settings(siteId); // the row, or the defaults (off, rev 0)
threadState({ settings, entry: { nodeId, collection: "posts", publishedAt }, thread, hasApproved, now });
// → "open" | "closed" | "hidden" | "off"   (90 days after first publication by default)
```

`CommentSettingsInput` is validated by `applySettingsInput` (unknown keys refused; `CommentSettingsError`, code `invalid_settings`). `collectionEnabled`, `closeAfterDaysFor`, `threadVisible` and `DEFAULT_RETENTION` are exported too.

## Text (§6.4, §8.1)

- `normalizeText`, `normalizeName`, `normalizeEmail`, `checkText`, `checkName`, `checkEmail`, `codePoints`, `cutCodePoints`, `CONTRACT_FORBIDDEN` — NFC, CRLF → LF, control and bidi characters removed (the contract refuses them), lengths in code points.
- `evaluateContent({ name, text }, { linkLimit, watchWords, blockedWords })` → `{ ok, status: "pending" | "spam", labels }` or `{ ok: false, field, problem }`; `compileWordList`, `matchesWordList`, `wordTokens`, `foldForMatch` (NFKC, Turkish `İ`/`I`/`ı` folded together, whole words), `countLinks`, `instructionLikeRules`/`isInstructionLike` (`INSTRUCTION_RULES_VERSION`, English and Turkish), `ruleLabels`.
- **Links:** `parseCommentText(text)` → paragraphs → lines → `{kind:"text"}|{kind:"link", href}` segments; `safeCommentHref`, `linkifyCommentLine`, `linkify`; `commentTextHtml(text)` for server-rendered HTML (escaped, `<p>`/`<br>`, `rel="ugc nofollow noopener noreferrer"` = `COMMENT_LINK_REL`). Only `https:` URLs with a dotted host and no userinfo become links. The rules match `@cloudhal/ui`'s interim `comment-model.ts`; the fixture pins them.

## Proof of work (§7)

```ts
import { deriveCommentKeys, difficultyFor, issueChallenge, verifyChallenge, ReplayCache } from "@cloudhal/comments";
const keys = await deriveCommentKeys(env.CLOUDHAL_COMMENTS_KEY); // HKDF per purpose: pow, emailHmac, email, secrets
const { challenge, bits, expiresAt } = await issueChallenge(keys.pow, { siteId, target: nodeId, kind: "comment", bits: difficultyFor(today, cap), now });
```

`v1.<payload>.<mac>`, stateless, 10 minutes, ≥ 3 s fill time, 18 bits rising to 20/21 with the daily cap. `solveChallenge` is the reference solver (tests, the browser worker's algorithm). Single use: `ReplayCache` per isolate plus the unique index on `challenge_id`.

## The pipeline (§6.2–§6.6)

```ts
import { handleCommentSubmission, handleReportSubmission, handleChallengeRequest,
         submissionResponse, challengeResponse, CommentLimiter, DailyCount, ReplayCache, memoize } from "@cloudhal/comments";
import { SqlCommentStore } from "@cloudhal/comments/sql";

// once per isolate
const limiter = new CommentLimiter(), daily = new DailyCount(), replay = new ReplayCache();
const settings = memoize(() => store.settings(env.CLOUDHAL_SITE_ID)); // 60 s

const deps: PipelineDeps = {
  siteId: env.CLOUDHAL_SITE_ID, available: true, hosts, clientAddress: request.headers.get("cf-connecting-ip")!,
  keys, now: () => new Date(), settings, resolveEntry, store, limiter, daily, replay,
  rateLimit?: (key) => …,           // optional Rate Limiting binding
  turnstile?: ({ token, remoteip, idempotencyKey }) => siteverify(…), // when the site uses Turnstile
};
return submissionResponse(await handleCommentSubmission(request, deps));
// reports: submissionResponse(await handleReportSubmission(request, deps), { pendingFragment: "comment-reported" })
// challenges: challengeResponse(await handleChallengeRequest(request, deps))
```

`resolveEntry(nodeId)` returns the **published** entry (`{ nodeId, collection, path, publishedAt }`) or `null`. Outcomes are `{ kind: "pending", stored, dropped? }` (honeypot, bad proof, replay, duplicate and bans are indistinguishable from a stored comment) or `{ kind: "error", status, error, fields?, retryAfter? }`; form posts answer `303` to `#comment-pending`, `#comment-invalid`, `#comment-closed`, `#comment-script-required`, `#comment-slow-down`, `#comment-try-again`, `#comment-paused`. Nothing is written before step 12; a month's first IP salt is inserted inside step 12's batch.

## Store (`@cloudhal/comments/sql`)

`new SqlCommentStore(sql, { now? })`:

| Area | Methods |
|---|---|
| Settings, secrets | `settings`, `putSettings(siteId, input, rev, by)`, `putSecret`, `readSecret`, `secretInfo`, `deleteSecret` |
| Threads | `thread`, `putThread(siteId, nodeId, { mode, closesAt? }, rev, by, { purge?, audit? })` |
| Pipeline (`SubmissionStore`) | `submit`, `report`, `approvedComment`, `readSalt`, `clientActivity`, `isDuplicate`, `storedSince`, `pendingOnEntry`, `isBanned`, `reportActivity` |
| Reads | `get`, `list(siteId, { status \| "reported", nodeId, nodeIds, label, since, cursor, limit ≤ 50, order })`, `threadComments`, `renderPage(siteId, nodeId, page)`, `counts`, `history`, `stateHash(siteId, ids, threads)` (`cm1:`) |
| Moderation | `moderate(siteId, { ids ≤ 50, action, actor, reasonCode?, note?, expectedRevs, approvalId?, ownNodeIds?, audit? })` → per-comment results; `label(siteId, { items, actor, source, expectedRevs?, ownNodeIds?, audit? })`; `reply(siteId, StaffReply)`; `editReply` |
| People only | `findCommenter`, `commenter(siteId, id, keys)` (decrypts the email), `commenters(siteId, ids, keys)` (three reads for any number), `commenterComments(siteId, id)` (one read), `hideApprovedOf(siteId, commentId, { actor, reasonCode })` (bounded, `more`), `erase(siteId, { commenterId } \| { commentIds }, "anonymise" \| "delete-text", person, { note?, audit? })`, `ban`, `listBans`, `liftBan` |
| Reports | `listReports`, `resolveReport` |
| `purgeQueue` | `queued`, `sites`, `enqueue`, `recent`, `log` (the publish path's purge log row), `sent`, `failed` — feed `planPurge` |
| `retention` | `run(siteId, retentionPlan(settings.retention, now))`, `deleteEntries(siteId, deletedEntriesDue(…))`, `runDeployment(now, oldestSaltMonthToKeep(now))` |

`approve`, `restore`, `delete`, replies, erasure and bans need a human actor (`CommentForbiddenError`, code `forbidden`); stale `rev`s are `CommentConflictError` (`conflict`) for single writes and per-comment `conflict` results for bulk writes. `audit` statements are appended to the same batch, last. Statement counts per path are in the store's header and asserted by the conformance suite.

## Purge planner and retention (§8.4, §9.3)

`planPurge({ rows, recent, now })` → `{ requests, nextCheckAt, takedownWaiting }`: takedowns at once (normal tags ride along), normal tags after 20 s and only while the last minute shows fewer than 3 purge requests (publish included), 100 tags a request. `purgeBackoffMs`, `settingsPurgeTags` (or "everything" above 300 entries), `commentsCacheTag`, `PURGE_LIMITS`. `retentionPlan` lists the bounded steps (500 rows a run).
