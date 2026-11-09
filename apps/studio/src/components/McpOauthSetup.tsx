import { Banner, ClipboardText, Select, Text } from "@cloudhal/ui";
import { Warning } from "@phosphor-icons/react";
import { useState } from "react";
import { useT } from "../i18n/index.tsx";
import {
  defaultOauthClient,
  OAUTH_CLIENTS,
  type OauthClient,
  type OauthClientStatus,
  type OauthServerInfo,
  oauthClientStatus,
  oauthSnippet,
  oauthSnippetLang,
} from "../lib/oauth-clients.ts";
import { CodeHighlighted } from "./CodeHighlighted.tsx";

/**
 * "Connect by URL" (RFC-0044 §4, §11): the deployment's `/mcp` URL and, for one client at a time,
 * what to paste and where. No key: the client opens Studio to sign in and approve. A client that
 * cannot connect says so: Cursor needs DCR, and Claude.ai and ChatGPT cannot reach a local or
 * plain-http URL (the picker then starts on Claude Code).
 */
export function McpOauthSetup({
  server,
}: {
  /** `features.mcpOauthClients`: the `/mcp` resource tokens are bound to, and the switches. */
  server: OauthServerInfo;
}) {
  const t = useT();
  const c = useT("connectedAgents");
  const resource = server.resource;
  const [client, setClient] = useState<OauthClient>(() => defaultOauthClient(resource));
  const snippet = oauthSnippet(client, resource);
  const status = oauthClientStatus(client, server);
  return (
    <div
      className="grid min-w-0 gap-4"
      data-testid="mcp-oauth-setup"
      data-client={client}
      data-status={status}
    >
      <div className="grid gap-1.5">
        <Text size="sm" bold as="span">
          {c("connectedAgents.setup.url")}
        </Text>
        <ClipboardText
          size="base"
          text={resource}
          tooltip={{ text: t("common.copy"), copiedText: t("common.copied") }}
        />
        <Text variant="secondary" size="sm">
          {c("connectedAgents.setup.urlDescription")}
        </Text>
      </div>
      <div className="grid min-w-0 gap-3">
        <Select
          className="w-full"
          label={c("connectedAgents.setup.client")}
          value={client}
          onValueChange={(v) => setClient(v as OauthClient)}
          items={Object.fromEntries(
            OAUTH_CLIENTS.map((k) => [k, c(`connectedAgents.setup.clients.${k}`)]),
          )}
        />
        {snippet && (
          <div className="min-w-0 overflow-x-auto">
            <CodeHighlighted code={snippet} lang={oauthSnippetLang(client)} showCopyButton />
          </div>
        )}
        <Text variant="secondary" size="sm">
          {c(`connectedAgents.setup.hints.${client}`)}
        </Text>
        {status !== "ok" && <StatusBanner status={status} client={client} resource={resource} />}
      </div>
    </div>
  );
}

function StatusBanner({
  status,
  client,
  resource,
}: {
  status: Exclude<OauthClientStatus, "ok">;
  client: OauthClient;
  resource: string;
}) {
  const c = useT("connectedAgents");
  const name = c(`connectedAgents.setup.clients.${client}`);
  const text = {
    needsDcr: () => c("connectedAgents.setup.needsDcr", { client: name }),
    needsPublicUrl: () => c("connectedAgents.setup.needsPublicUrl", { url: resource }),
    unavailable: () => c("connectedAgents.setup.unavailable"),
  }[status]();
  return <Banner variant="alert" icon={<Warning size={16} />} description={text} />;
}
