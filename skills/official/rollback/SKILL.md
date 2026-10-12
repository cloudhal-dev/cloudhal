---
name: rollback
description: Restore a site to an earlier snapshot after confirming the target with the user. Use when something published is wrong and the user asks to revert, undo or roll back.
license: Apache-2.0
compatibility: Requires the Cloudhal MCP server (list_snapshots, diff_snapshots, rollback). Rollback stops at a human approval gate.
metadata:
  cloudhal.schemaVersion: "1"
  cloudhal.requiresCapabilities: "content"
  cloudhal.scopes: "site:read,site:rollback"
  cloudhal.approval: "rollback"
---

# Rollback

## Steps
1. `list_snapshots` and identify the currently live snapshot and the candidate target (an ancestor of the live one). Show the user label, actor, time and summary of both.
2. `diff_snapshots` live → target and summarise what will change.
3. Call `rollback` with the target id. On `input_required`, relay the question verbatim and pass the user's decision back.
4. Report the new live snapshot id and remind that the rollback itself is recorded as a snapshot.

## Rules
- Never choose the target yourself when more than one plausible candidate exists; ask.
- Rolling back does not delete content; later snapshots remain available.
