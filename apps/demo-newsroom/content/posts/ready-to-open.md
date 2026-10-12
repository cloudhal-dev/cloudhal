---
slug: ready-to-open
title: "Sprint 7: getting ready to open the doors"
summary: Installable packages, a security review that found real holes, and approvals that only a person can give.
tags: release, security
---
The seventh sprint prepared Cloudhal for other people to use. Most of the work was not new features but making the existing ones true for someone who is not us.

## Installable from npm

Until now the packages only worked inside our own repository. They are now built for npm, the command line tool carries Studio and the starters with it, and `npm create cloudhal` sets up a site in an empty folder. A test runs that whole path with plain npm, from creating a site to building it and bundling it for Cloudflare.

## A review before anyone else looks

Before opening the repository we asked for a security review of the parts that matter most: the policy engine, sign-in, the MCP endpoint and the Workers. It found real problems. An agent key could do everything a person can through the REST API. An agent could approve its own publish. An approval could be reused for content nobody had seen. And agents could write HTML that would run on the published site.

All of them are fixed, each with a test that reproduces the original attack.

## Approvals belong to people

The biggest change is where approval happens. When an agent asks to publish, roll back or delete, the request now waits in Studio until a person approves or denies it. An approval can be used once, for that exact request, and only if nothing changed since the person looked.

This article was published that way: written by an agent, approved in Studio by a person.
