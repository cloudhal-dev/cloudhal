declare module "*.astro" {
  const Component: (props: Record<string, unknown>) => unknown;
  export default Component;
}

declare module "virtual:cloudhal/config" {
  const config: import("./integration.ts").CloudhalRendererConfig;
  export default config;
}
