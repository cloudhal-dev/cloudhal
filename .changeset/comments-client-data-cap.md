---
"@cloudhal/comments": patch
---

Hashed network addresses and proof-of-work ids are now kept at most 30 days, as the privacy notice says. `retention.clientDataDays` accepts 1–30 (`MAX_CLIENT_DATA_DAYS`), and the retention plan and the settings reader clamp a value stored before the cap.
