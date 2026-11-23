/**
 * Which workerd binary this machine can run (RFC-0047 §9, docs/guides/self-host.md "Platforms").
 *
 * The official linux-arm64 build links Google's tcmalloc, which assumes a 48-bit virtual address
 * space and aborts at start on 39-bit kernels: Raspberry Pi OS's 4 KiB kernels and others
 * (cloudflare/workerd#5020). `workerd --version` aborts the same way, so it is the probe. The image
 * may carry a community build without tcmalloc (deploy/docker/workerd-no-tcmalloc, pinned by
 * version and SHA-256); on such a kernel it is used instead, else the start ends with a message
 * that says what to do.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

export const VA39_MESSAGE =
  "workerd cannot start on this kernel: it has a 39-bit virtual address space (Raspberry Pi OS's default 4 KiB kernel, among others), and the official workerd's allocator needs 48 bits (cloudflare/workerd#5020). On a Raspberry Pi 5, boot the default 16 KiB kernel (kernel_2712.img, no kernel= line in config.txt); on a Pi 4 or 3, use a 64-bit OS with a 48-bit kernel such as Ubuntu Server; or use an image that carries the tcmalloc-free build (docs/guides/self-host.md, Platforms).";

export interface WorkerdChoice {
  readonly binary: string;
  /** Why the fallback was taken, for the log. */
  readonly note?: string;
}

type Probe = (binary: string) => {
  status: number | null;
  output: string;
  signal?: string | null;
  error?: Error;
};

export const OLD_CPU_MESSAGE =
  "workerd stopped on an illegal instruction: this x86-64 CPU (or the VM's CPU model) lacks x86-64-v2 (SSE4.2, POPCNT; CPUs since about 2009). In Proxmox or QEMU set the VM's CPU type to host or x86-64-v2-AES (docs/guides/self-host.md, Platforms).";

const probeVersion: Probe = (binary) => {
  const r = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 30_000 });
  return {
    status: r.status,
    signal: r.signal,
    output: `${r.stdout ?? ""}${r.stderr ?? ""}`,
    ...(r.error ? { error: r.error } : {}),
  };
};

const vaFailure = (output: string) =>
  output.includes("MmapAligned() failed") || output.includes("48-bit virtual address");

export function chooseWorkerd(
  input: { official: string; fallback?: string | undefined },
  probe: Probe = probeVersion,
  exists: (file: string) => boolean = existsSync,
): WorkerdChoice {
  const first = probe(input.official);
  if (first.status === 0) return { binary: input.official };
  if (first.error)
    throw new Error(`cannot run workerd (${input.official}): ${first.error.message}`);
  if (first.signal === "SIGILL" || first.status === 132) throw new Error(OLD_CPU_MESSAGE);
  if (!vaFailure(first.output))
    throw new Error(
      `workerd --version failed (exit ${first.status}): ${first.output.trim().slice(-600)}`,
    );
  if (input.fallback && exists(input.fallback)) {
    const second = probe(input.fallback);
    if (second.status === 0)
      return {
        binary: input.fallback,
        note: "39-bit kernel: using the tcmalloc-free community build of workerd",
      };
  }
  throw new Error(VA39_MESSAGE);
}
