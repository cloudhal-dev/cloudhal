/**
 * `cloudhal owner transfer --to <email>` — Owner lockout recovery (RFC-0005 §3, open question 7).
 * The operator, who holds the deployment token and is already root for site data, makes an
 * existing member the deployment's Owner; the current Owner becomes an Administrator. Audited as
 * `member.transfer-ownership` with `via: "deploy-token"`.
 */
import { brief, deployment, type SyncOptions } from "./sync.ts";

export interface OwnerTransferOptions extends SyncOptions {
  /** Email of the member who becomes the Owner. */
  readonly to: string;
}

export interface OwnerTransferResult {
  from: string | null;
  to: string;
  name: string;
  email: string;
}

export async function transferOwner(options: OwnerTransferOptions): Promise<OwnerTransferResult> {
  const email = options.to.trim();
  if (!email.includes("@")) throw new Error("usage: cloudhal owner transfer --to <email>");
  const { adminUrl, token, fetch: f } = await deployment(options);
  const res = await f(new URL("/api/admin/owner", adminUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const body = await res.text();
  if (res.status === 404)
    throw new Error(
      `no member with the email ${email} on this deployment (invite them first): ${brief(body)}`,
    );
  if (!res.ok) throw new Error(`owner transfer failed (${res.status}): ${brief(body)}`);
  const result = JSON.parse(body) as OwnerTransferResult;
  options.log?.(`${result.name} <${result.email}> is now the Owner`);
  return result;
}
