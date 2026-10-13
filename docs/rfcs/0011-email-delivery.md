# RFC-0011: Email delivery with Cloudflare Email Service
- Status: Accepted (2026-10-13, PR #24 approved by Halil with the defaults of the open questions as drafted; ADR-0025)
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-13
- Related: RFC-0005 §7.2 (`MailSender`, emailed invites) and open question 6 (reset links), RFC-0007 D1 and v1.1 (mail adapters), ADR-0012 (two Workers), the 2026-10-13 audit roadmap (P0 "Email Service")
- Sources (checked 2026-10-13 in `cloudflare/cloudflare-docs` at `0cd4753`, `src/content/docs/email-service/`): Workers API `send()` and error codes — https://developers.cloudflare.com/email-service/api/send-emails/workers-api/ · send binding restrictions — https://developers.cloudflare.com/email-service/configuration/send-bindings/ · pricing and plans — https://developers.cloudflare.com/email-service/platform/pricing/ · limits and verified destinations — https://developers.cloudflare.com/email-service/platform/limits/ · allowed headers — https://developers.cloudflare.com/email-service/reference/headers/ · local simulation — https://developers.cloudflare.com/email-service/local-development/sending/

## Summary
Cloudhal has had a `MailSender` interface since RFC-0005 but ships no sender, so invites are copied by hand and a forgotten password needs an Administrator. This RFC ships one sender, backed by the Cloudflare Email Service `send_email` binding, switched on by a `mail` key in `cloudhal.json` that `cloudhal deploy` turns into a binding locked to one sender address. With it, invites can be emailed (already built, RFC-0005 §7.2) and staff can reset their own password by email (new).

## Motivation
- **Invites:** the inviter copies a link and delivers it through another channel. Studio already offers "Send by email" when `/api/instance` reports `invites.delivery: ["link", "email"]`; nothing in a deployment can make that true today.
- **Forgotten passwords:** only an Administrator can issue a reset link (RFC-0005 open question 6). An Owner who forgets their password has nobody to ask; on a one-person deployment that is every deployment.
- **Who is affected:** every deployment with more than one person, and every Owner.
- **Why now:** Email Service sends from a Worker through a binding: no API key, no second vendor, no external `fetch`. RFC-0007 already named "Cloudflare Email" as the adapter to add.

## Proposal

### Configuration
```jsonc
// cloudhal.json
{
  "mail": {
    "from": "studio@example.com", // required; its domain must be onboarded to Email Service
    "fromName": "Example Studio"  // optional display name
  }
}
```
- No `mail` key: no binding, link delivery only (today's behaviour).
- `cloudhal deploy` refuses a `from` that is not a plain address (`local@domain`, no display name, no CR/LF).

### Deploy
The **admin Worker** gets
```jsonc
"send_email": [{ "name": "EMAIL", "allowed_sender_addresses": ["studio@example.com"] }],
"vars": { "CLOUDHAL_MAIL_FROM": "studio@example.com", "CLOUDHAL_MAIL_FROM_NAME": "Example Studio" }
```
`allowed_sender_addresses` locks the binding to the configured address, so code running in the Worker cannot send as anyone else in the account. The site Worker gets no binding: nothing it does sends mail yet.

### Sender
```ts
// packages/api/src/mail.ts — the interface stays; an error type is added
export class MailError extends Error {
  /** The service's code (e.g. "E_SENDER_NOT_VERIFIED"), or "E_UNKNOWN". */
  readonly code: string;
  /** Rate or daily limits and internal errors: trying later may work. */
  readonly retryable: boolean;
}

// packages/cloudflare/src/mail.ts — Worker-only
export interface SendEmailBinding {
  send(message: {
    to: string;
    from: { email: string; name?: string };
    subject: string;
    text: string;
    html?: string;
    headers?: Record<string, string>;
  }): Promise<{ messageId: string }>;
}
export function cloudflareEmailSender(
  binding: SendEmailBinding,
  from: { email: string; name?: string },
): MailSender; // id: "cloudflare-email"
```
- Every message carries `Auto-Submitted: auto-generated` (RFC 3834) so auto-responders do not reply.
- The sender strips CR/LF from the subject, and never logs a message body: bodies carry one-time links.
- A thrown error becomes a `MailError` with the service's `code`.
- The admin Worker passes the sender to `createApi({ mail })` when both the binding and `CLOUDHAL_MAIL_FROM` are present.
- **Local:** `cloudhal studio` with a `mail` key uses a terminal sender. It prints recipient, subject and text (links included) and sends nothing, so the flows can be tried offline.

### Emailed invites (completes RFC-0005 §7.2)
- **Unchanged:** creating an invite with `delivery: "email"` mails the link and does not show it to the inviter. Accepting it sets `emailVerified = true`.
- **New, on failure:** if the send throws, the invite is canceled at once, never left pending and unseen. The call answers **502 `delivery_failed`** with `{code, retryable}`. The attempt is audited as `member.invite-failed` with the code. Studio shows the reason and offers "Copy a link instead".

### Password reset by email (new)
```
POST /api/password-reset/request {email}  →  202 {ok: true}
```
- **Public and limited:** JSON only. At most 10 requests per minute per IP (the existing `limitPublic`). At most 3 mails per address per hour, keyed on the address's hash, so nobody can mail-bomb a member.
- **No enumeration:** the answer is always the same 202, whether or not the address belongs to a member. The lookup and the send run **after the response** (`waitUntil` on Workers), so response time does not tell either.
- **Same token machinery:** a member gets the `chrst_` reset link Administrators already issue: 1 hour, single use, and issuing it voids older links. `createdBy` is the member themself. It is audited as `member.password-reset` with `via: "email"`.
- **Redeeming:** through the existing `/api/password-reset/{inspect,complete}`. Completing a link that was mailed also sets `emailVerified = true`.
- **Who:** every member, the Owner included: it is their address. Removed people are not members and get nothing.
- **Off by default:** only when a sender exists. `/api/instance` reports `passwordReset: ["admin"] | ["admin", "email"]`. Studio's sign-in screen links "Forgot password?" to a `/forgot-password` screen with one email field, which always ends in the same neutral confirmation.
  - *Implementation note:* `/api/instance` is for members only, so the sign-in screen cannot read it. The link is always shown; without a sender the request answers 404 `email_unavailable` (the same for every address), and the screen says to ask an Administrator.

### Message content
- Plain text only in v1.
- Every name in a message (deployment, inviter, member) is text the deployment's own staff entered, so there is no HTML to escape and none to inject.
- Messages are in English in v1 and name the deployment. Per-member languages are a later change: members have no stored locale yet.

### Invariants
1. No `mail` key, no binding, no sender: every flow is exactly today's.
2. A one-time token reaches only the address on file, inside the link's fragment. It never appears in a response, a log or an audit entry.
3. The request endpoint answers the same way, in the same time, for members and non-members.
4. The binding can send only from the configured address.
5. A failed send never leaves an invite pending that nobody received.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Resend (or another vendor) with an API key | Works on Workers Free; mature deliverability tooling | A secret to manage, a second vendor and its terms, an external `fetch` (50 per invocation on Free) | Keep the adapter shape open for it (RFC-0007 names it); Cloudflare first, since the deployment already lives there |
| Email Service REST API with an API token | Same service, also usable from the CLI | An account token with send rights stored as a Worker secret | The binding needs no secret and can be locked to one sender |
| Better Auth's `sendResetPassword` | Built in | Its own token table and verification flow next to Cloudhal's audited `chrst_` links; two reset systems | One reset mechanism, one audit trail |
| Magic-link sign-in instead of password reset | No passwords to forget | Changes how everyone signs in; session and device questions | Out of scope; can build on the same sender later |
| HTML messages | Nicer | Escaping, templates, dark-mode rendering, larger surface | Plain text is enough for links; HTML is a later, separate change |

## Compatibility & migration
- **Contracts:** none. `cloudhal.json` gains an optional `mail` key, read leniently like `analytics` and `comments`.
- **API:**
  - `/api/instance` adds `passwordReset`.
  - The new endpoint is `POST /api/password-reset/request`.
  - `POST /api/invites` with `delivery: "email"` can now answer 502 `delivery_failed`.
  - `MailError` is new in `@cloudhal/api`.
  - All additive; a Studio without the new screen keeps working.
- **Data:** no migration. Per-address limits use the existing rate-limit table (migration 0005).
- **Rollout:** set `mail.from`, onboard the domain in Email Service, and redeploy.
- **Rollback:** remove the key and redeploy. The binding goes away and the flows fall back to links. Already-mailed links keep working until they expire.

## Security & policy impact
- No new scopes. The request endpoint is public by nature, so it is bounded by the per-IP and per-address limits and gives no signal about membership.
- **Account takeover** now also goes through the member's mailbox. That is the norm for password accounts; RFC-0005's Administrator-issued links stay.
- **Header injection:** subjects are stripped of CR/LF, and the only custom header is a fixed `Auto-Submitted`.
- **Spoofing:** the binding is locked to one sender (`allowed_sender_addresses`). Email Service handles SPF/DKIM for onboarded domains.
- **Tenant isolation:** unchanged. One deployment, one sender.

## Plans and costs
- **Arbitrary recipients** need Workers Paid: 3,000 mails a month included, then $0.35 per 1,000.
- **Workers Free:** a deployment can send only to verified destination addresses of the same account. That covers an Owner resetting their own password, if their address is verified there.
- `cloudhal deploy` prints this once when `mail` is set and `schedules.plan` is not `paid`.

## Open questions
1. Per-address limit: **3 per hour** **[default]**, or 5?
2. Send a "your password was changed" notice after every reset, emailed or not? **[default: yes, when a sender exists]**
3. A `cloudhal mail test <address>` command (through the deploy token) to check the domain set-up before the first invite? **[default: not in v1; the first failed invite shows the service's code]**
4. Staff notifications (scheduler stalled, comments waiting for moderation, weekly digest) and reader reply notifications (RFC-0007 v1.1) use this sender. They need per-member preferences and unsubscribe links (`List-Unsubscribe`), so they are a follow-up RFC. **[default: follow-up]**
