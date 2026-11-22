/**
 * RFC-0047 §4: `CLOUDHAL_CLUSTER_ADVERTISE`, the address an instance's peers reach it at.
 *
 * - unset: this container's hostname and the cluster port (compose sets a service name instead);
 * - `auto`: the first IPv4 address of this container that is not loopback;
 * - `auto:<cidr>`: the first IPv4 address inside that network, for a container on several
 *   networks (Docker Swarm: the stack's own overlay, not the ingress network);
 * - anything else: as given, with the cluster port added when it has none.
 */
import os from "node:os";

type Interfaces = ReturnType<typeof os.networkInterfaces>;

function ipv4(text: string): number | undefined {
  const parts = text.split(".");
  if (parts.length !== 4) return undefined;
  let n = 0;
  for (const p of parts) {
    if (p === "" || p.length > 3 || [...p].some((c) => c < "0" || c > "9")) return undefined;
    const v = Number(p);
    if (v > 255) return undefined;
    n = n * 256 + v;
  }
  return n;
}

/** `10.231.0.0/24` → a test for addresses inside it; throws on anything else. */
export function inCidr(cidr: string): (address: string) => boolean {
  const slash = cidr.indexOf("/");
  const base = ipv4(slash === -1 ? cidr : cidr.slice(0, slash));
  const bits = slash === -1 ? 32 : Number(cidr.slice(slash + 1));
  if (base === undefined || !Number.isInteger(bits) || bits < 0 || bits > 32)
    throw new Error(
      `CLOUDHAL_CLUSTER_ADVERTISE: ${cidr} is not an IPv4 network such as 10.0.0.0/24`,
    );
  const size = 2 ** (32 - bits);
  const start = Math.floor(base / size) * size;
  return (address) => {
    const a = ipv4(address);
    return a !== undefined && a >= start && a < start + size;
  };
}

export function resolveAdvertise(
  value: string | undefined,
  port: number,
  host: { interfaces?: Interfaces; hostname?: string } = {},
): string {
  if (!value) return `${host.hostname ?? os.hostname()}:${port}`;
  if (value === "auto" || value.startsWith("auto:")) {
    const inside = value === "auto" ? () => true : inCidr(value.slice("auto:".length));
    const found = Object.values(host.interfaces ?? os.networkInterfaces())
      .flatMap((list) => list ?? [])
      .find((i) => i.family === "IPv4" && !i.internal && inside(i.address));
    if (!found)
      throw new Error(
        `CLOUDHAL_CLUSTER_ADVERTISE=${value}: this container has no such IPv4 address`,
      );
    return `${found.address}:${port}`;
  }
  return value.lastIndexOf(":") > value.lastIndexOf("]") ? value : `${value}:${port}`;
}
