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
  /** No `dataDir` on the `cloudflare` target (`virtualConfig`). */
  const config: import("./integration.ts").VirtualCloudhalConfig;
  export default config;
}

declare module "virtual:cloudhal/comments-client" {
  /** The built comments module and worker in `cloudhal dev`; `null` elsewhere. */
  const client: import("./comments-client.ts").CommentsClient | null;
  export default client;
}

declare module "virtual:cloudhal/theme-hooks" {
  /**
   * RFC-0043 §1.7: loads the project's `src/theme.ts` lazily (an empty module when the project
   * has none), so a status page can ask for the theme's `statusPage` hook without evaluating
   * the theme on the normal path.
   */
  export const loadTheme: () => Promise<Record<string, unknown>>;
}
