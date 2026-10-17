/**
 * English `aiSettings.*`, a lazy message namespace (`../namespaces.ts`, DESIGN.md §1): site
 * settings' AI section (RFC-0016) — the switch, the model picker, the daily cap and AI Gateway.
 * The source of truth for its keys; `aiSettings.tr.ts` is typed against it.
 */
export const messages = {
  aiSettings: {
    title: "AI",
    description:
      "Lets editors improve, shorten, translate or rewrite selected text with Cloudflare Workers AI. Nothing is sent until you turn it on.",
    unavailable: {
      title: "This deployment can't reach Workers AI yet",
      description:
        'Add "ai": {} to cloudhal.json and deploy again. On your own server, set CLOUDFLARE_ACCOUNT_ID and CLOUDHAL_AI_TOKEN. You can choose the settings now.',
    },
    enabled: {
      label: "AI in the editor",
      hint: "Editors see an “Ask AI” menu on selected text. Results replace the text only when they choose Replace.",
    },
    model: {
      label: "Model",
      hint: "Quality, speed and price differ by model. Try one on a real article before you settle.",
      placeholder: "Search models",
      empty: "No model matches",
      clear: "Clear",
      show: "Show models",
      recommended: "Recommended",
      notes: {
        default: "Builds pages most reliably in Cloudhal's tests; writes Turkish well.",
        quality: "Stronger writing, at a higher price.",
        budget: "Fast and inexpensive; weaker at building pages.",
        general: "A well-known general-purpose model.",
      },
      context: "{tokens} tokens of context",
      gone: "{model} is no longer offered by Workers AI. Choose another model, or AI commands will fail.",
      catalogUnavailable:
        "The model list couldn't be read, so only the recommended models are shown.",
      privacyWorkers: "Selected text goes to Workers AI in this Cloudflare account.",
      privacyProvider: "Selected text goes to {provider} through your AI Gateway.",
    },
    limit: {
      label: "Daily limit",
      hint: "AI commands this site may run each day (UTC). 0 stops them.",
      error: "A whole number from 0 to 10,000",
      used: "{used} of {limit} used today",
    },
    advanced: "AI Gateway and other providers",
    gateway: {
      label: "AI Gateway",
      hint: "Optional. A gateway in this Cloudflare account logs, caches and limits AI calls.",
      placeholder: "my-gateway",
      error: "Lowercase letters, digits and hyphens",
    },
    provider: {
      label: "Model from another provider",
      hint: "provider/model, such as openai/gpt-4.1-mini. Runs through the gateway with its stored keys or unified billing; Cloudhal stores no keys.",
      placeholder: "openai/gpt-4.1-mini",
      error: "Write it as provider/model",
      needsGateway: "Set an AI Gateway first.",
    },
    saved: "AI settings saved",
    failed: "Couldn't save the AI settings",
    conflict: "Someone changed these settings in the meantime. Reload to see their version.",
    reload: "Reload",
  },
} as const;
