---
"@cloudhal/api": minor
"@cloudhal/cloudflare": minor
"@cloudhal/cli": minor
---

Email delivery with Cloudflare Email Service (RFC-0011).

- **`cloudhal.json` `mail`** (`{ "from": "studio@example.com", "fromName": "…" }`): `cloudhal deploy` gives the admin Worker a `send_email` binding locked to that one sender, plus `CLOUDHAL_MAIL_FROM(_NAME)`. A `from` that is not a plain address is an error. Without the key, nothing changes.
- **Emailed invites** now work end to end. If the email cannot be sent, the invite is canceled and the API answers `502 delivery_failed` with the service's code; Studio says so and offers a link instead. The attempt is audited as `member.invite-failed`.
- **Forgot password**: `POST /api/password-reset/request {email}` always answers 202, the same for members and strangers, and sends after the response. Limits: 10 per minute per IP, 3 emails per address per hour. Opening the emailed link marks the address verified. Every completed reset sends a "your password was changed" notice. Studio's sign-in screen links to a new `/forgot-password` screen. `/api/instance` reports `passwordReset`.
- **`@cloudhal/cloudflare/mail`**: `cloudflareEmailSender` (plain text, `Auto-Submitted: auto-generated`, one-line subjects, never logs bodies) and `adminMail(env)`. **`@cloudhal/api`** exports `MailError`, `MailMessage` and `MailSender`, and takes a `defer` option for work after the response.
- **Offline**: `cloudhal studio` prints these emails in the terminal instead of sending them.
