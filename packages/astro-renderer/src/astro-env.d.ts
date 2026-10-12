declare module "*.astro" {
  const Component: (props: Record<string, unknown>) => unknown;
  export default Component;
}

declare module "virtual:cloudhal/analytics-client" {
  /** The built analytics scripts in `cloudhal dev`; `null` elsewhere. */
  const client: import("./analytics-client.ts").AnalyticsClient | null;
  export default client;
}

declare module "virtual:cloudhal/config" {
  const config: import("./integration.ts").CloudhalRendererConfig;
  export default config;
}

declare module "virtual:cloudhal/comments-client" {
  /** The built comments module and worker in `cloudhal dev`; `null` elsewhere. */
  const client: import("./comments-client.ts").CommentsClient | null;
  export default client;
}
