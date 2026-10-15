---
"@cloudhal/api": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/ui": minor
---

Click-to-scope in the Build view (RFC-0020 §6). `PreviewPanel` can pick a section or component of the previewed page with a layer over the frame (`pick`, `previewTargetAt`, `previewElement`), and previews mark surface components with `data-component-id`. Build chat sends the picked part as `scope`, which the API checks against the page and gives the model with its JSON Pointer.
