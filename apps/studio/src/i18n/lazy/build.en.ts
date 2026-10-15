/**
 * English `build.*`, a lazy message namespace (`../namespaces.ts`, DESIGN.md §1 "Lazy message
 * namespaces"): Studio's Build view (RFC-0020 §6), loaded only with that route. The source of
 * truth for its keys; `build.tr.ts` is typed against it.
 */
export const messages = {
  build: {
    title: "Build · {title}",
    description:
      "Agents change this draft with the theme's catalog; every step lands here as it happens.",
    backToEditor: "Back to editor",
    preview: "Live preview",
    connection: {
      live: "Live",
      connecting: "Connecting…",
      lost: "Reconnecting…",
    },
    connect: {
      title: "Connect an agent",
      description:
        "Point any MCP client at this Studio. The agent reads the catalog, then builds the page step by step; nothing is published until you do.",
      endpoint: "MCP endpoint",
      steps: "Ask your agent to",
      step1: "call get_catalog for the components it may use",
      step2: "call patch_draft with JSON Patch operations on this page",
      step3: "fix what comes back as VALIDATION_FAILED and send again",
      pageId: "Page id",
    },
    activity: {
      title: "Activity",
      empty: "Nothing yet",
      emptyDescription: "Changes appear here the moment an agent or a person saves this page.",
      applied: "Applied",
      rejected: "Refused",
      changed: "{count} sections changed",
      changedOne: "1 section changed",
      unchanged: "Page details changed",
      operations: "{count} operations",
      refused: "{count} problems to fix",
      refusedOne: "1 problem to fix",
      repair: "Repaired: {text}",
    },
  },
} as const;
