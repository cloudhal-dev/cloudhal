---
"@cloudhal/agent-runtime": minor
"@cloudhal/api": minor
---

Sites and projects in Studio, phase D (RFC-0034 §3, §7).

**agent-runtime**
- New person scope `site:create`, held by Owners and Administrators.
- New ability `sites.create`.
- A site-limited person does not get `site:create`.

**api**
- `POST /api/sites` creates a site in Studio (`site:create`). The site starts like `cloudhal init`, and nothing is published.
- `GET /api/projects` lists the projects that hold sites the person may open. For each of those sites it returns the languages, primary host, publish state and pending approvals.

**Studio** (private)
- Sites gets "New site": name, short name, language and project.
- With more than one project, each site row names its project.
- New project overview screen at `/projects/<id>`: the project's sites side by side, a summary, and "New site in this project".
