import { ClipboardText, SectionCard, Tabs, Text } from "@cloudhal/ui";
import { PlugsConnected } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { McpClientSetup } from "./McpClientSetup.tsx";
import { McpOauthSetup } from "./McpOauthSetup.tsx";

/**
 * The "Connect an MCP client" card (DESIGN.md §2a aside): with an agent key (endpoint, header and
 * ready-to-paste client config) and, where the server runs OAuth for remote clients (RFC-0044
 * §4), by URL (`McpOauthSetup`). Only the key tab where OAuth is off or not reported.
 */
export function ConnectMcpCard({ endpoint }: { endpoint: string }) {
  const t = useT();
  const c = useT("connectedAgents");
  const instance = useQuery({ queryKey: ["instance"], queryFn: api.instance, retry: false });
  const oauth = instance.data?.features.mcpOauth
    ? instance.data.features.mcpOauthClients
    : undefined;
  const [tab, setTab] = useState<"url" | "key">("url");
  const shown = oauth ? tab : "key";
  return (
    <SectionCard
      title={t("agents.connect.title")}
      icon={<PlugsConnected size={16} />}
      description={oauth ? c("connectedAgents.setup.description") : t("agents.connect.description")}
    >
      {oauth && <OauthTabs tab={tab} onTab={setTab} />}
      {shown === "url" && oauth ? (
        <McpOauthSetup resource={oauth.resource} registration={oauth} />
      ) : (
        <KeySetup endpoint={endpoint} />
      )}
    </SectionCard>
  );
}

function OauthTabs({ tab, onTab }: { tab: "url" | "key"; onTab: (tab: "url" | "key") => void }) {
  const c = useT("connectedAgents");
  return (
    <Tabs
      variant="segmented"
      value={tab}
      onValueChange={(v) => onTab(v === "key" ? "key" : "url")}
      tabs={[
        { value: "url", label: c("connectedAgents.setup.tabs.url") },
        { value: "key", label: c("connectedAgents.setup.tabs.key") },
      ]}
    />
  );
}

function KeySetup({ endpoint }: { endpoint: string }) {
  const t = useT();
  return (
    <>
      <dl className="grid gap-4">
        <div className="grid gap-1.5">
          <dt>
            <Text size="sm" bold as="span">
              {t("agents.connect.endpoint")}
            </Text>
          </dt>
          <dd className="min-w-0">
            <ClipboardText
              size="base"
              text={endpoint}
              tooltip={{ text: t("common.copy"), copiedText: t("common.copied") }}
            />
          </dd>
        </div>
        <div className="grid gap-1.5">
          <dt>
            <Text size="sm" bold as="span">
              {t("agents.connect.header")}
            </Text>
          </dt>
          <dd className="min-w-0">
            <ClipboardText
              size="base"
              text="Authorization: Bearer"
              tooltip={{ text: t("common.copy"), copiedText: t("common.copied") }}
            />
          </dd>
        </div>
      </dl>
      <McpClientSetup endpoint={endpoint} local />
    </>
  );
}
