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
    chat: {
      title: "Build with AI",
      description:
        "Describe what this page should have. The site's model builds it step by step on the draft; you publish when it looks right.",
      label: "Build conversation",
      placeholder:
        "A landing page for our launch: a dark hero with a headline and a button, three features, pricing in tabs and a short FAQ.",
      brief: "What should the page have?",
      send: "Build",
      stop: "Stop",
      writing: "Writing {components}…",
      thinking: "Thinking…",
      fixing: "Fixing what was refused…",
      done: "{steps} steps applied to the draft",
      doneRefused: "{steps} steps applied; {refused} refused and sent back to the model",
      nothing: "Nothing changed",
      stopped: "Stopped",
      off: "AI is off for this site",
      offHint: "An Administrator can turn it on and choose a model in Settings › AI.",
      unavailable: "This deployment can't reach Workers AI",
      unavailableHint:
        "On Cloudflare, AI uses the Worker's binding; locally, set CLOUDFLARE_ACCOUNT_ID and CLOUDHAL_AI_TOKEN.",
      settings: "Open settings",
      errors: {
        ai_budget:
          "Today's AI commands for this site are used up. An Administrator can raise the daily limit in Settings › AI.",
        ai_busy: "Another AI job of yours is still running.",
        ai_off: "AI is off for this site. An Administrator can turn it on in Settings › AI.",
        ai_model_unavailable:
          "The chosen model isn't available. An Administrator can pick another in Settings › AI.",
        ai_rate_limited: "Workers AI is busy right now. Try again in a moment.",
        ai_unavailable: "This deployment can't reach Workers AI.",
        ai_failed: "The model couldn't finish. What it built so far stays on the draft.",
      },
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
