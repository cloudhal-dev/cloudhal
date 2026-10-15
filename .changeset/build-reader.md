---
"@cloudhal/api": minor
---

Build chat reads the model's JSON objects wherever it breaks lines. Pretty-printed objects, several objects on one line, a bare operation or `ops` holding one operation all count as steps. Prose and code fences are set aside instead of being refused line by line, and an answer with no object at all gets one clear refusal. Build eval runs keep up to five refusal reasons (`samples`).
