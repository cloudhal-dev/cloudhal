# Security Policy

Cloudhal lets autonomous agents change and publish websites. A policy-engine bypass, a scope escalation or a credential leak is a critical vulnerability for us, and we treat reports accordingly.

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private reporting:
https://github.com/cloudhal-dev/cloudhal/security/advisories/new

If you cannot use GitHub, email **security@cloudhal.com**.

Include: affected package/version or commit, reproduction steps, impact, and whether the issue is already public.

## Our commitment

| Step | Target |
|---|---|
| Acknowledge receipt | within 2 working days |
| Initial assessment and severity | within 7 days |
| Fix or mitigation for Critical/High | within 30 days of confirmation |
| Credit | in the advisory and release notes, unless you prefer anonymity |

We follow coordinated disclosure: we ask that you give us the chance to fix before publishing details, and we will not take legal action against good-faith research that respects this policy and avoids privacy violations, data destruction or service degradation.

## Supported versions

Pre-1.0: only the latest minor of each published package receives security fixes.

## Scope notes for agent-native features

In scope: policy engine, scope enforcement on MCP tools, snapshot/rollback integrity, tenant isolation, secrets handling in capabilities, skill loading. Prompt-injection findings are in scope when they lead to an action the policy engine should have blocked.

See [docs/security/threat-model.md](docs/security/threat-model.md) for what Cloudhal protects, how, and the risks accepted for the alpha.
