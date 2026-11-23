/**
 * A minimal S3 client for the self-host image (RFC-0047 §3): path-style URLs, SigV4 with
 * `UNSIGNED-PAYLOAD`, as workerd's own bucket client signs them. Node built-ins only (main.ts).
 * Used for the bucket's lifecycle rule at start and by scripts/store-conformance.ts.
 */
import { createHash, createHmac } from "node:crypto";

export interface S3Target {
  readonly endpoint: string;
  readonly bucket: string;
  readonly key: string;
  readonly secret: string;
  readonly region: string;
  readonly sessionToken?: string | undefined;
}

export interface S3Response {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
}

const hmac = (k: Buffer | string, d: string) => createHmac("sha256", k).update(d).digest();
const RESERVED = "!'()*";
/** RFC 3986 encoding, as SigV4 wants it. */
const enc = (s: string) =>
  [...encodeURIComponent(s)]
    .map((c) => (RESERVED.includes(c) ? `%${c.charCodeAt(0).toString(16).toUpperCase()}` : c))
    .join("");

/** `20261123T101500Z` and `20261123`. */
function stamp(now: Date): { time: string; day: string } {
  const iso = now.toISOString(); // 2026-11-23T10:15:00.000Z
  const time = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  return { time, day: time.slice(0, 8) };
}

export async function s3Request(
  t: S3Target,
  method: string,
  objectKey: string,
  opts: {
    query?: Record<string, string>;
    headers?: Record<string, string>;
    body?: Uint8Array | string;
    now?: Date;
  } = {},
): Promise<S3Response> {
  const base = t.endpoint.endsWith("/") ? t.endpoint.slice(0, -1) : t.endpoint;
  const url = new URL(`${base}/${t.bucket}${objectKey ? `/${objectKey}` : ""}`);
  const query = Object.entries(opts.query ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
  for (const [k, v] of query) url.searchParams.append(k, v);
  const { time, day } = stamp(opts.now ?? new Date());
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    "x-amz-date": time,
    ...(t.sessionToken ? { "x-amz-security-token": t.sessionToken } : {}),
    ...Object.fromEntries(Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
  };
  const names = Object.keys(headers).sort();
  const canonicalQuery = query.map(([k, v]) => `${enc(k)}=${enc(v)}`).join("&");
  const canonicalPath = url.pathname
    .split("/")
    .map((p) => enc(decodeURIComponent(p)))
    .join("/");
  const canonical = [
    method,
    canonicalPath,
    canonicalQuery,
    ...names.map((n) => `${n}:${(headers[n] as string).trim()}`),
    "",
    names.join(";"),
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const scope = `${day}/${t.region}/s3/aws4_request`;
  const toSign = [
    "AWS4-HMAC-SHA256",
    time,
    scope,
    createHash("sha256").update(canonical).digest("hex"),
  ].join("\n");
  const signing = hmac(hmac(hmac(hmac(`AWS4${t.secret}`, day), t.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signing).update(toSign).digest("hex");
  const { host: _host, ...sent } = headers;
  const res = await fetch(url, {
    method,
    headers: {
      ...sent,
      authorization: `AWS4-HMAC-SHA256 Credential=${t.key}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
    },
    ...(opts.body !== undefined ? { body: opts.body } : {}),
  });
  return { status: res.status, headers: res.headers, text: await res.text() };
}

/** The text of the first `<name>…</name>` in `xml` (indexOf scans, no regular expression). */
export function xmlTag(xml: string, name: string): string | undefined {
  const open = xml.indexOf(`<${name}>`);
  if (open === -1) return undefined;
  const close = xml.indexOf(`</${name}>`, open);
  return close === -1 ? undefined : xml.slice(open + name.length + 2, close);
}

export const ABORT_MPU_LIFECYCLE =
  "<LifecycleConfiguration><Rule><ID>cloudhal-abort-incomplete-multipart</ID><Filter><Prefix></Prefix></Filter><Status>Enabled</Status><AbortIncompleteMultipartUpload><DaysAfterInitiation>1</DaysAfterInitiation></AbortIncompleteMultipartUpload></Rule></LifecycleConfiguration>";

/**
 * The bucket's lifecycle rule for incomplete multipart uploads (RFC-0047 §3), only when the bucket
 * has no lifecycle configuration at all: a PUT replaces the whole configuration, so a bucket with
 * rules of its own is left as it is. Returns what happened, for the log.
 */
export async function ensureLifecycle(t: S3Target): Promise<"set" | "kept" | "unsupported"> {
  const current = await s3Request(t, "GET", "", { query: { lifecycle: "" } });
  if (current.status === 200) return "kept";
  if (current.status !== 404) return "unsupported";
  const md5 = createHash("md5").update(ABORT_MPU_LIFECYCLE).digest("base64");
  const put = await s3Request(t, "PUT", "", {
    query: { lifecycle: "" },
    headers: { "content-md5": md5, "content-type": "application/xml" },
    body: ABORT_MPU_LIFECYCLE,
  });
  return put.status === 200 ? "set" : "unsupported";
}

/**
 * The bucket, created when missing (RFC-0047 §5): workerd's cluster cannot start without it.
 * HEAD first, so credentials without CreateBucket work for a bucket that exists. Throws on any
 * other answer; the caller retries while the store starts.
 */
export async function ensureBucket(t: S3Target): Promise<"exists" | "created"> {
  const head = await s3Request(t, "HEAD", "");
  if (head.status === 200) return "exists";
  if (head.status !== 404)
    throw new Error(`HEAD of the bucket ${t.bucket} answered ${head.status}`);
  const put = await s3Request(t, "PUT", "");
  if (put.status === 200) return "created";
  if (put.status === 409 && xmlTag(put.text, "Code") === "BucketAlreadyOwnedByYou") return "exists";
  throw new Error(
    `creating the bucket ${t.bucket} answered ${put.status} ${xmlTag(put.text, "Code") ?? ""}`,
  );
}
