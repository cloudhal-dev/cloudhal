import { Select, Text } from "@cloudhal/ui";
import { CodeHighlighted } from "@cloudhal/ui/code";
import { useState } from "react";
import { useT } from "../i18n/index.tsx";
import { type McpClient, mcpSnippet, REMOTE_CLIENTS, snippetLang } from "../lib/agents.ts";

/**
 * Ready-to-copy setup for one MCP client at a time (docs/agents/clients.md): a client picker, the
 * snippet for this deployment's `/mcp`, and where it goes. With `agentKey` (the one-time reveal)
 * the key is filled in; `local` adds the stdio server for the person's own machine.
 */
export function McpClientSetup({
  endpoint,
  agentKey,
  local = false,
  label,
}: {
  endpoint: string;
  agentKey?: string;
  local?: boolean;
  /** The picker's label; "Client" by default. */
  label?: string;
}) {
  const t = useT();
  const [client, setClient] = useState<McpClient>("claude");
  const clients: McpClient[] = local ? [...REMOTE_CLIENTS, "stdio"] : [...REMOTE_CLIENTS];
  return (
    <div className="grid min-w-0 gap-3" data-testid="mcp-client-setup" data-client={client}>
      <Select
        className="w-full"
        label={label ?? t("agents.connect.client")}
        value={client}
        onValueChange={(v) => setClient(v as McpClient)}
        items={Object.fromEntries(clients.map((c) => [c, t(`agents.connect.clients.${c}`)]))}
      />
      <div className="min-w-0 overflow-x-auto">
        <CodeHighlighted
          code={mcpSnippet(client, endpoint, agentKey)}
          lang={snippetLang(client)}
          showCopyButton
        />
      </div>
      <Text variant="secondary" size="sm">
        {t(`agents.connect.hints.${client}`)}
      </Text>
    </div>
  );
}
