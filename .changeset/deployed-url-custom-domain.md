---
"@cloudhal/cli": patch
---
`cloudhal deploy` no longer fails with "Invalid URL" after deploying a site with a custom domain from a fresh checkout (Workers Builds): wrangler lists the domain as `example.com (custom domain)`, and the note is now dropped before the address is used.
