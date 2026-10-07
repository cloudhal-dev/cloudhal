/// <reference types="astro/client" />
declare module "virtual:cloudhal/config" {
  const config: import("@cloudhal/astro-renderer").CloudhalRendererConfig;
  export default config;
}
