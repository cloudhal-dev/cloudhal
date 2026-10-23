---
slug: typed-fields
title: "0.5: typed fields for every collection"
summary: A collection can define its own fields, from dates to images, and agents, Studio and themes all read the same definitions.
tags: release, content
---
An event needs a start time and a venue, a job a salary and a deadline. Collections can now define typed fields: text, rich text, number, yes or no, date, date and time, link, image and choice.

## One checker for everyone

The same checker validates values in the store, the API and the MCP server. It also produces the JSON Schema agents receive, so an agent's output is checked before a person is asked to approve it. Fields can be required before publishing while drafts save freely.

## Languages decided per field

Each field says whether it is translated. A price is shared and read from the original, a description is written per language. Changing only a shared value no longer marks translations as out of date.

## Changes that never lose data

Renaming a field, changing its type or its language setting, and removing it are explicit operations. Each shows what it will change, takes a snapshot first, waits for approval and can be reverted. A plain edit of the definitions is refused if it would drop a value.

## Forms and themes

Studio builds the entry form from the definitions and has a builder for them. Themes get resolved, formatted values and a component that lists them, so new sites show fields without custom code.
