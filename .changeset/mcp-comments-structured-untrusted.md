---
"@cloudhal/mcp-server": minor
---

Comment tools now carry reader text in `structuredContent` in the same safe form as in the text content: every reader name, comment text and report detail is an escaped `<reader-name>`, `<reader-text>` or `<reader-report>` block, and `list_comments`, `get_comment_thread` and `draft_comment_reply` add an `untrustedNotice`. Clients that show `text` or `author.name` must unescape the block's content (RFC-0007 invariant C8).
