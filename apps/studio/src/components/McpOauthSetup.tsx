import { Banner, ClipboardText, Select, Text } from "@cloudhal/ui";
import { Warning } from "@phosphor-icons/react";
import { useState } from "react";
import { useT } from "../i18n/index.tsx";
import {
  OAUTH_CLIENTS,
  type OauthClient,
  type OauthRegistration,
  oauthClientStatus,
  oauthSnippet,
  oauthSnippetLang,
} from "../lib/oauth-clients.ts";
import { CodeHighlighted } from "./CodeHighlighted.tsx";

/**
 * "Connect by URL" (RFC-0044 §4, §11): the deployment's `/mcp` URL and, for one client at a time,
 * what to paste and where. No key: the client opens Studio to sign in and approve. A client that
 * cannot connect with this server's registration switches says so (Cursor needs DCR).
 */
export function McpOauthSetup({
  resource,
  registration,
}: {
  /** The `/mcp` resource tokens are bound to (`features.mcpOauthClients.resource`). */
  resource: string;
  registration: OauthRegistration;
}) {
  const t = useT();
  const c = useT("connectedAgents");
  const [client, setClient] = useState<OauthClient>("claudeAi");
  const snippet = oauthSnippet(client, resource);
  const status = oauthClientStatus(client, registration);
  const name = c(`connectedAgents.setup.clients.${client}`);
  return (
    <div className="grid min-w-0 gap-4" data-testid="mcp-oauth-setup" data-client={client}>
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
        {status !== "ok" && (
          <Banner
            variant="alert"
            icon={<Warning size={16} />}
            description={
              status === "needsDcr"
                ? c("connectedAgents.setup.needsDcr", { client: name })
                : c("connectedAgents.setup.unavailable")
            }
          />
        )}
      </div>
    </div>
  );
}
