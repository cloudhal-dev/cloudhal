---
slug: agents-through-mcp
title: "Sprint 5: agents operate sites through MCP"
summary: Eighteen typed tools, a policy engine, automatic snapshots and a publish step that always stops for a person.
tags: release, agents
---
With the fifth sprint an agent can work on a Cloudhal site from any MCP client: list and edit pages, write articles, preview them, and ask to publish.

## Policy before tools

Every call goes through a policy engine. Agents get read, write and preview scopes by default; publishing and rollback need explicit grants. An agent following a skill is limited to the scopes that skill declared.

## Every change is a snapshot

Each mutation records a snapshot automatically, so anything an agent did can be diffed and rolled back. An audit log keeps who called which tool, under which skill, with which outcome.

## Publishing stops for a person

Publish, rollback and delete return an approval request with a summary of what will change. The person answers in their client; nothing happens until they accept. Clients that cannot ask get a signed, single-purpose token instead.

This article was published that way.
