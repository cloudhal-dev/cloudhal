---
"@cloudhal/api": minor
---

Studio translation routes (RFC-0033 / ADR-0035, phase E1).

- `GET /api/sites/:siteId/translations[?locale=]`: every language version on the site, with title, path and staleness.
- `GET /api/sites/:siteId/translations/:nodeId`: one node's translation group.
- `POST /api/sites/:siteId/translations/:nodeId/review`: a person reviews a translation (people only, CAS on rev). Machine output becomes `machine-reviewed`, and the review takes one snapshot.
- `GET` and `PUT /api/sites/:siteId/glossary`: the site's glossary. Changing it requires `site:settings`.

Studio's page and article editors gain a Translations card that lists the node's language versions and lets a person review a machine translation.
