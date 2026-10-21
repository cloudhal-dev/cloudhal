---
"@cloudhal/api": patch
"@cloudhal/cli": patch
---

Studio's images load faster and stop re-downloading. Preview URLs carry the file's hash (`?v=`), so the browser keeps them for a day; without it the content route answers `private, no-cache` and a 304 through the ETag, instead of `no-store`. While an image loads, its tile shows the image's own colour and small blurred preview (computed at upload) instead of a spinner.
