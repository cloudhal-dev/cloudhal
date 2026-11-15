/// <reference types="astro/client" />
declare module "virtual:cloudhal/config" {
  /** No `dataDir` on the Cloudflare Site Worker; `cloudhal dev` and static builds have it. */
  const config: import("@cloudhal/astro-renderer").VirtualCloudhalConfig;
  export default config;
}
