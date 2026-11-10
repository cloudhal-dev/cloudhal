/**
 * English `connectedAgents.*`, a lazy message namespace (`../namespaces.ts`, DESIGN.md §1): the
 * agents connected by URL through OAuth on `/agents` and the "Connect by URL" setup (RFC-0044 §4,
 * §11). The source of truth for its keys; the other languages are drafts from `pnpm i18n:import`.
 */
export const messages = {
  connectedAgents: {
    title: "Connected agents",
    description:
      "Apps you connected by URL, such as Claude, ChatGPT or Cursor. Each works as you, never beyond your role, until you disconnect it.",
    allTitle: "Everyone's connected agents",
    allDescription:
      "Every member's connections. Disconnecting one ends it at once; its member can connect it again.",
    columns: {
      agent: "Agent",
      owner: "Member",
      access: "Access",
      lastUsed: "Last used",
      connected: "Connected",
    },
    identifiedBy: "Identified by {host}",
    selfRegistered: "Self-registered, not verified",
    lookalike: "Looks like {client}, not verified as it",
    never: "Never",
    disconnect: "Disconnect",
    disconnectLabel: "Disconnect {client}",
    resource: "connection",
    disconnected: "Disconnected",
    disconnectedDescription:
      "{client} can no longer work in this Studio. If it asks to connect again, you decide again.",
    empty: "No agents connected by URL",
    emptyDescription:
      "Add this Studio's MCP URL to Claude, ChatGPT, Cursor or VS Code. You approve each connection here.",
    allEmpty: "Nobody has connected an agent by URL",
    setup: {
      description:
        "Give an app this Studio's MCP URL and approve it when it asks, or create an agent key for scripts and clients that cannot sign in.",
      tabs: { key: "With an agent key", url: "Connect by URL" },
      url: "MCP URL",
      urlDescription:
        "The app opens this Studio in your browser, you sign in and approve what it may do. No key to copy.",
      client: "App",
      clients: {
        claudeAi: "Claude.ai, Desktop and mobile",
        claudeCode: "Claude Code",
        codex: "ChatGPT and Codex",
        cursor: "Cursor",
        vscode: "VS Code",
        inspector: "MCP Inspector",
      },
      hints: {
        claudeAi:
          "In Claude, open Settings, then Connectors, and add a custom connector with this URL. Claude opens Studio to approve it.",
        claudeCode:
          "Run it in a terminal, then type /mcp inside Claude Code and choose Authenticate. Your browser opens Studio to approve it.",
        codex:
          "Codex: run both lines; the second opens Studio to approve it. ChatGPT: add a connector with this URL in its settings.",
        cursor:
          "Save it as ~/.cursor/mcp.json, or .cursor/mcp.json in a project, then sign in when Cursor asks. Studio opens to approve it.",
        vscode:
          "Save it as .vscode/mcp.json in your project, then start the server. VS Code asks you to sign in and opens Studio.",
        inspector:
          "Run it, choose Streamable HTTP, paste the URL and open Auth Settings, then Quick OAuth Flow. Good for checking a connection.",
      },
      needsDcr:
        "{client} registers itself (dynamic client registration), which is off on this server. Ask its operator to turn CLOUDHAL_MCP_DCR back on, or use an agent key.",
      needsPublicUrl:
        "Claude.ai and ChatGPT connect from their own servers, which cannot reach {url}. Start Studio with --base-url set to a public https:// address, or use an app on this computer, such as Claude Code or Codex.",
      unavailable:
        "Neither way an app can identify itself is on here (metadata documents and dynamic registration). Ask this server's operator, or use an agent key.",
    },
  },
} as const;
