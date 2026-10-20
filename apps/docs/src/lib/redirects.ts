/**
 * Permanent redirects for cloudhal.dev (ADR-0039 rule 3): a URL the site has served never 404s.
 * When a page moves, add `old → new` here. The post-build step writes these into `_redirects`
 * ahead of the static rules.
 */
export const REDIRECTS: readonly (readonly [from: string, to: string])[] = [
  // Linked by the playground Worker's `deployUrl` (packages/cloudflare README).
  ["/docs/deploy", "/docs/guides/deploy-button"],
  // ADR-0037: the Studio design system is DESIGN.md.
  ["/docs/design", "/docs/design/design"],
  // Folders without an index page.
  ["/docs/guides", "/docs"],
  ["/docs/engineering", "/docs/engineering/code-structure"],
  ["/docs/security", "/docs/security/threat-model"],
  ["/github", "https://github.com/cloudhal-dev/cloudhal"],
];

/** `_redirects` lines; site-internal targets are 301, external ones 302. */
export function redirectLines(): string[] {
  return REDIRECTS.map(([from, to]) => `${from} ${to} ${to.startsWith("/") ? 301 : 302}`);
}
