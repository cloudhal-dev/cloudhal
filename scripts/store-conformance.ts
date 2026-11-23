/**
 * RFC-0047 §3: does an S3-compatible store do what workerd's cluster and R2 binding need? Run
 * against an endpoint (any store), or with `--docker seaweedfs|rustfs` against a throwaway
 * container of the image compose.yml pins (SeaweedFS) or of RustFS. Every request is path-style
 * and signed with SigV4 and `UNSIGNED-PAYLOAD`, as workerd signs them.
 *
 * Required (a failure exits 1):
 * - put and get, overwrite, range get, delete;
 * - `If-None-Match: *` atomic under concurrency: of 12 racing creates exactly one succeeds and the
 *   others answer 412 or 409 (owner records and leases);
 * - `If-Match` with a stale ETag refused, with the current one accepted;
 * - multipart above 8 MiB (two parts), ListParts, completion, abort;
 * - ListObjectsV2 paging with continuation tokens.
 * Reported, not required: a lifecycle rule that aborts incomplete multipart uploads (the guide
 * asks operators to set one; a store without it keeps abandoned parts).
 *
 *   node scripts/store-conformance.ts --endpoint http://host:8333 --bucket b --key K --secret S
 *   node scripts/store-conformance.ts --docker seaweedfs|rustfs
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ABORT_MPU_LIFECYCLE,
  type S3Target,
  s3Request,
  xmlTag,
} from "../packages/cli/src/selfhost/s3.ts";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Store = S3Target;
const s3 = s3Request;
const tag = xmlTag;

type Check = {
  name: string;
  required: boolean;
  run: (st: Store, p: string) => Promise<string | true>;
};

const CHECKS: Check[] = [
  {
    name: "put, get, range, overwrite, delete",
    required: true,
    async run(st, p) {
      if ((await s3(st, "PUT", `${p}a`, { body: "hello world" })).status !== 200) return "PUT";
      const g = await s3(st, "GET", `${p}a`);
      if (g.text !== "hello world") return `GET gave ${g.status} ${g.text.slice(0, 40)}`;
      const r = await s3(st, "GET", `${p}a`, { headers: { range: "bytes=6-10" } });
      if (r.status !== 206 || r.text !== "world") return `range gave ${r.status} ${r.text}`;
      if ((await s3(st, "PUT", `${p}a`, { body: "again" })).status !== 200) return "overwrite";
      if ((await s3(st, "DELETE", `${p}a`)).status !== 204) return "DELETE";
      return (await s3(st, "GET", `${p}a`)).status === 404 || "a deleted object still answers";
    },
  },
  {
    name: "If-None-Match: * is atomic (12 racing creates, exactly one wins)",
    required: true,
    async run(st, p) {
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          s3(st, "PUT", `${p}lease`, { headers: { "if-none-match": "*" }, body: `writer ${i}` }),
        ),
      );
      const codes = results.map((r) => r.status);
      const won = codes.filter((c) => c === 200).length;
      const refused = codes.filter((c) => c === 412 || c === 409).length;
      if (won !== 1 || refused !== 11) return `statuses ${codes.join(",")}`;
      const again = await s3(st, "PUT", `${p}lease`, {
        headers: { "if-none-match": "*" },
        body: "late",
      });
      return (
        again.status === 412 || again.status === 409 || `a later create answered ${again.status}`
      );
    },
  },
  {
    name: "If-Match: a stale ETag is refused, the current one accepted",
    required: true,
    async run(st, p) {
      const first = await s3(st, "PUT", `${p}rec`, { body: "v1" });
      const etag1 = first.headers.get("etag");
      if (!etag1) return "PUT gave no ETag";
      const second = await s3(st, "PUT", `${p}rec`, { headers: { "if-match": etag1 }, body: "v2" });
      if (second.status !== 200) return `If-Match current answered ${second.status}`;
      const stale = await s3(st, "PUT", `${p}rec`, { headers: { "if-match": etag1 }, body: "v3" });
      if (stale.status !== 412 && stale.status !== 409)
        return `If-Match stale answered ${stale.status}`;
      return (await s3(st, "GET", `${p}rec`)).text === "v2" || "the stale write landed";
    },
  },
  {
    name: "multipart above 8 MiB: create, two parts, list parts, complete; abort another",
    required: true,
    async run(st, p) {
      const created = await s3(st, "POST", `${p}big`, { query: { uploads: "" } });
      const id = tag(created.text, "UploadId");
      if (!id) return `create answered ${created.status}`;
      const one = randomBytes(5 * 1024 * 1024);
      const two = randomBytes(4 * 1024 * 1024);
      const etags: string[] = [];
      for (const [n, body] of [one, two].entries()) {
        const r = await s3(st, "PUT", `${p}big`, {
          query: { partNumber: String(n + 1), uploadId: id },
          body,
        });
        const e = r.headers.get("etag");
        if (r.status !== 200 || !e) return `part ${n + 1} answered ${r.status}`;
        etags.push(e);
      }
      const parts = await s3(st, "GET", `${p}big`, { query: { uploadId: id } });
      if (parts.status !== 200 || !parts.text.includes("<PartNumber>2</PartNumber>"))
        return `ListParts answered ${parts.status}`;
      const xml = `<CompleteMultipartUpload>${etags.map((e, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${e}</ETag></Part>`).join("")}</CompleteMultipartUpload>`;
      const done = await s3(st, "POST", `${p}big`, { query: { uploadId: id }, body: xml });
      if (done.status !== 200 || done.text.includes("<Error>"))
        return `complete answered ${done.status} ${done.text.slice(0, 120)}`;
      const got = await s3(st, "GET", `${p}big`);
      if (got.headers.get("content-length") !== String(one.length + two.length))
        return `size ${got.headers.get("content-length")}`;
      const other = tag(
        (await s3(st, "POST", `${p}gone`, { query: { uploads: "" } })).text,
        "UploadId",
      );
      if (!other) return "second create";
      const aborted = await s3(st, "DELETE", `${p}gone`, { query: { uploadId: other } });
      return aborted.status === 204 || `abort answered ${aborted.status}`;
    },
  },
  {
    name: "ListObjectsV2 pages with continuation tokens",
    required: true,
    async run(st, p) {
      for (const n of ["k1", "k2", "k3", "k4", "k5"])
        await s3(st, "PUT", `${p}list/${n}`, { body: n });
      const seen: string[] = [];
      let token: string | undefined;
      for (let page = 0; page < 5; page++) {
        const q: Record<string, string> = {
          "list-type": "2",
          prefix: `${p}list/`,
          "max-keys": "2",
        };
        if (token) q["continuation-token"] = token;
        const r = await s3(st, "GET", "", { query: q });
        if (r.status !== 200) return `list answered ${r.status}`;
        for (const part of r.text.split("<Key>").slice(1))
          seen.push(part.slice(0, part.indexOf("</Key>")));
        token = tag(r.text, "NextContinuationToken");
        if (tag(r.text, "IsTruncated") !== "true") break;
        if (!token) return "truncated with no continuation token";
      }
      return seen.length === 5 || `listed ${seen.length} of 5 (${seen.join(",")})`;
    },
  },
  {
    name: "lifecycle rule that aborts incomplete multipart uploads",
    required: false,
    async run(st) {
      const body = ABORT_MPU_LIFECYCLE;
      const md5 = createHash("md5").update(body).digest("base64");
      const r = await s3(st, "PUT", "", {
        query: { lifecycle: "" },
        headers: { "content-md5": md5 },
        body,
      });
      return r.status === 200 || `PUT ?lifecycle answered ${r.status} ${tag(r.text, "Code") ?? ""}`;
    },
  },
];

function dockerStore(kind: string): { store: Store; stop: () => void } {
  const name = `store-conformance-${kind}-${process.pid}`;
  const key = `conf${randomBytes(6).toString("hex")}`;
  const secret = randomBytes(24).toString("hex");
  const port = 39333;
  if (kind === "seaweedfs") {
    const compose = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../deploy/docker/compose.yml"),
      "utf8",
    );
    const image = /image: (chrislusf\/seaweedfs:\S+)/.exec(compose)?.[1] as string;
    const config = JSON.stringify({
      identities: [
        {
          name: "c",
          credentials: [{ accessKey: key, secretKey: secret }],
          actions: ["Admin", "Read", "Write", "List", "Tagging"],
        },
      ],
    });
    execFileSync(
      "docker",
      [
        "run",
        "-d",
        "--name",
        name,
        "-p",
        `127.0.0.1:${port}:8333`,
        "-e",
        `S3_CONFIG=${config}`,
        "--entrypoint",
        "/bin/sh",
        image,
        "-c",
        'printf "%s" "$S3_CONFIG" > /tmp/s3.json && exec weed server -dir=/data -s3 -s3.config=/tmp/s3.json -master.volumeSizeLimitMB=64',
      ],
      { stdio: "ignore" },
    );
  } else if (kind === "rustfs") {
    execFileSync(
      "docker",
      [
        "run",
        "-d",
        "--name",
        name,
        "-p",
        `127.0.0.1:${port}:9000`,
        "-e",
        `RUSTFS_ACCESS_KEY=${key}`,
        "-e",
        `RUSTFS_SECRET_KEY=${secret}`,
        "rustfs/rustfs:1.0.6",
        "/data",
      ],
      { stdio: "ignore" },
    );
  } else throw new Error(`--docker seaweedfs|rustfs, not ${kind}`);
  return {
    store: {
      endpoint: `http://127.0.0.1:${port}`,
      bucket: "conformance",
      key,
      secret,
      region: "us-east-1",
    },
    stop: () => void spawnSync("docker", ["rm", "-f", "-v", name], { stdio: "ignore" }),
  };
}

async function main(): Promise<number> {
  const kind = arg("docker");
  const made = kind ? dockerStore(kind) : undefined;
  const st: Store = made?.store ?? {
    endpoint: arg("endpoint") ?? "",
    bucket: arg("bucket") ?? "",
    key: arg("key") ?? process.env.AWS_ACCESS_KEY_ID ?? "",
    secret: arg("secret") ?? process.env.AWS_SECRET_ACCESS_KEY ?? "",
    region: arg("region") ?? "us-east-1",
  };
  try {
    if (made) {
      for (let i = 0; i < 60; i++) {
        const r = await s3(st, "PUT", "").catch(() => undefined);
        if (r && (r.status === 200 || r.text.includes("BucketAlreadyOwnedByYou"))) break;
        if (i === 59) throw new Error("the store did not create the bucket within 120 s");
        await sleep(2000);
      }
    }
    const prefix = `conformance-${Date.now()}/`;
    let failed = 0;
    for (const c of CHECKS) {
      const result = await c.run(st, prefix).catch((e: Error) => e.message);
      const ok = result === true;
      if (!ok && c.required) failed++;
      console.log(`${ok ? "✓" : c.required ? "✗" : "!"} ${c.name}${ok ? "" : `: ${result}`}`);
    }
    console.log(
      failed ? `\n${failed} required check(s) failed.` : "\nThe store does what Cloudhal needs.",
    );
    return failed ? 1 : 0;
  } finally {
    made?.stop();
  }
}

process.exitCode = await main();
