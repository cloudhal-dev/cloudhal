---
"@cloudhal/core-ts": minor
"@cloudhal/mcp-server": minor
---

Surface interop (RFC-0020 20f, part 2). `@cloudhal/core-ts/interop` converts A2UI v0.9 messages (basic catalog) and json-render specs to and from Cloudhal surfaces, deterministically, and lists whatever it cannot carry in `notes`. Over MCP, `import_surface` adds or replaces a page surface from either format through `patch_draft`'s repairs and validation, and `export_surface` returns a surface as A2UI messages or a json-render spec.
