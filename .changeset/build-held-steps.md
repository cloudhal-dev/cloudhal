---
"@cloudhal/api": minor
---

Build chat holds a step that only waits for a later one, such as a surface sent before its `root` or a child linked before it is added (at most 3), and writes it with the step that completes it. It also reads JSON with raw line breaks in strings or trailing commas, rewrites component paths given by id to positions (reported as repairs), and tells the model to send a surface's `root` with it. Studio's Build chat recommends `@cf/openai/gpt-oss-120b`, the Build model eval's pick, when the site uses another model.
