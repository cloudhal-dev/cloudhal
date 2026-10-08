/** Site hostnames (Site.domains): validation and choosing the primary one. */
import type { Site } from "@cloudhal/core-contracts";

type Domain = Site["domains"][number];

/** Same rule as the contract's `Domain.hostname`: lower-case labels, a TLD, at most 253 chars. */
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** A hostname as a person might type it ("https://News.Example.com/") → "news.example.com". */
export function normalizeHostname(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/\.$/, "");
}

export function isHostname(value: string): boolean {
  return value.length <= 253 && HOSTNAME.test(value);
}

/**
 * `hostname` becomes the primary domain; every other domain stays, as secondary. Order: the
 * primary first, then the rest in their previous order.
 */
export function withPrimaryDomain(domains: readonly Domain[], hostname: string): Domain[] {
  return [
    { hostname, primary: true },
    ...domains.filter((d) => d.hostname !== hostname).map((d) => ({ ...d, primary: false })),
  ];
}
