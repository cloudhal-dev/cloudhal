# ADR-0025: Email delivery — one `MailSender` on the Cloudflare Email Service binding
- Status: Accepted
- Date: 2026-10-13
- Related: RFC-0011 (the design), RFC-0005 §7.2 and open question 6 (emailed invites, reset links), RFC-0007 D1 (mail adapters), ADR-0012 (two Workers)
- Sources: Email Service Workers API, send bindings, pricing, limits and allowed headers — https://developers.cloudflare.com/email-service/ (checked 2026-10-13 in `cloudflare/cloudflare-docs` at `0cd4753`)

## Context
`MailSender` has existed since RFC-0005 without an implementation, so invites were copied by hand and only an Administrator could reset a password; an Owner who forgot theirs had nobody to ask. Email Service sends from a Worker through a `send_email` binding: no API key, no second vendor, no external `fetch`. Sending to any recipient needs Workers Paid (3,000 mails a month included); on Free only verified destination addresses of the account can receive.

## Decision
Adopt RFC-0011 with its defaults, accepted by the owner on 2026-10-13 (PR #24):
- **Switch.** An optional `mail: {from, fromName?}` in `cloudhal.json`. `cloudhal deploy` gives the admin Worker a `send_email` binding locked to that one address (`allowed_sender_addresses`) and the `CLOUDHAL_MAIL_FROM(_NAME)` vars. No key: no binding, link delivery only.
- **Sender.** `cloudflareEmailSender` in `@cloudhal/cloudflare`: plain text, `Auto-Submitted: auto-generated`, CR/LF stripped from subjects, bodies never logged, failures as `MailError {code, retryable}`. `cloudhal studio` prints mail to the terminal instead of sending.
- **Invites.** A failed send cancels the invite and answers 502 `delivery_failed`; the attempt is audited as `member.invite-failed`.
- **Password reset by email.** `POST /api/password-reset/request {email}` always answers 202; the lookup and the send run after the response. Limits: 10 per minute per IP, 3 mails per address per hour. It issues the existing audited `chrst_` link (1 hour, single use, voids older links) with the member as `createdBy`; completing a self-issued link marks the email verified. Every completed reset sends a "your password was changed" notice when a sender exists. `/api/instance` reports `passwordReset`, and Studio shows "Forgot password?" only when email is offered.
- **Not in v1:** HTML mail, a `cloudhal mail test` command, staff and reader notifications (a follow-up RFC: they need preferences and unsubscribe links).

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Resend with an API key | Works on Free | A secret, a second vendor, an external `fetch` | Possible later adapter |
| Email Service REST API | Usable from the CLI | An account token stored as a secret | The binding needs no secret and is lockable to one sender |
| Better Auth `sendResetPassword` | Built in | A second reset system beside the audited `chrst_` links | One mechanism, one audit trail |

## Consequences
- **Positive:** invites by email work end to end; no deployment depends on an Administrator to recover a password; no secrets added.
- **Negative:** account recovery now also runs through the member's mailbox; arbitrary recipients need Workers Paid.
- **Risks:** an unonboarded sending domain fails at the first send. Invites surface the service's code; reset requests fail silently by design (no enumeration), so the owner sees it only in Worker logs.
