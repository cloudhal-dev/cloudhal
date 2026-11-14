---
"@cloudhal/cli": patch
---

`render_page` on Node gives a slow Chrome more chances to start. A launch that hangs past its start budget or exits is killed, and the renderer tries again up to three times. Each try uses a new profile, and the pause doubles from 1 s. The error says how long a launch may take and how many tries were made. A Chrome that crashes after it started is launched again by the next render, and its profile is removed (#207).
