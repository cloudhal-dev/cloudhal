---
"@cloudhal/cli": patch
---
Cloudhal packages are now published from GitHub Actions with npm trusted publishing and provenance: each version on npm links to the commit and workflow run that built it, and `npm audit signatures` verifies it.
