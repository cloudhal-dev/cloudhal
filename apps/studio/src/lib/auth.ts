import { adminClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Same-origin (Vite proxies /api in dev; `cloudhal studio` serves both in prod), so no baseURL. */
export const authClient = createAuthClient({ plugins: [organizationClient(), adminClient()] });
