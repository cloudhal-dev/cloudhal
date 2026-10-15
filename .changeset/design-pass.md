---
"@cloudhal/api": minor
"@cloudhal/cli": minor
---

The design pass (RFC-0021 21c).
- **Build chat looks once per turn.** After its steps, the draft is rendered with the deployment's browser. Vision models (Llama 4 Scout, Mistral Small 3.1, Gemma 3) see screenshots and the failed checks; other models see the checks. The model then gets one round to fix what it saw. Studio says what it saw.
- **The Build model eval scores design.** `cloudhal ai build-eval --design [--look] [--judge <model>|none]` renders each result, records failed checks and asks a vision judge for a 1–5 rubric score (fidelity, hierarchy, rhythm, spacing, readability, mobile).
