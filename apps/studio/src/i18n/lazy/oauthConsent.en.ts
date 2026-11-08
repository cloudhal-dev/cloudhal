/**
 * English `oauthConsent.*`, a lazy message namespace (`../namespaces.ts`, DESIGN.md §1): the
 * consent screen a remote MCP client's authorization request lands on (RFC-0044 §4). The source
 * of truth for its keys; the other languages are drafts from `pnpm i18n:import`.
 */
export const messages = {
  oauthConsent: {
    title: "Connect {client}",
    description:
      "An agent asks to work in this Studio for you. Check what it may do before you approve.",
    invalid: {
      title: "This request can't be used",
      description:
        "It expired, was already answered, or was changed on the way. Start the connection again from the agent.",
    },
    who: {
      title: "Who is asking",
      fromHost: "Identified by {host}",
      registered: "Registered with this Studio",
      sendsBack: "Sends you back to {host}",
      thisComputer: "Sends you back to an app on this computer",
      loopbackWarning:
        "Every address this agent can send you back to is on this computer. Approve only if you started the connection from an app here.",
      stepUp: "This agent is already connected and asks for more. What it may do today is ticked.",
    },
    scopes: {
      title: "What it may do",
      description:
        "Untick anything it should not do. Your role decides the rest: what it does not give is left out.",
      legend: "Permissions",
      notInRole: "{label} (not in your role)",
      narrowed: "{label}, only for your own work in your role ({scope})",
      offline:
        "It stays connected and renews its access by itself until you disconnect it on the Agents page.",
      sites:
        "{count, plural, one {It reaches only the site you work on.} other {It reaches only the # sites you work on.}}",
      none: "Choose at least one permission.",
    },
    mode: {
      title: "How it works",
      description: "How independently the agent may work. You can change it later.",
      legend: "Agent mode",
    },
    approve: "Approve",
    deny: "Deny",
  },
} as const;
