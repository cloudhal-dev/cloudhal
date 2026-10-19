---
"@cloudhal/api": minor
---

Translation coverage across a project, phase F (RFC-0034 §7).

**API**
- `GET /api/sites/:siteId/translations?scope=project` covers every site of the project the person may open. Untranslated pages and articles come back as groups of one, and the response lists each site's languages.

**Studio**
- **Translations:** gains "This site / All sites in the project". In the project view there is a column per site and language, and each cell opens that site's editor.
- **Language settings:** explain adding a language to this site versus starting a language edition, and offer "Create a language edition…".
