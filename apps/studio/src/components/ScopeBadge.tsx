import { Badge, Tooltip } from "@cloudhal/ui";
import { useT } from "../i18n/index.tsx";
import { scopeVariant } from "../lib/agents.ts";
import type { AgentScope } from "../lib/api.ts";

/** Scope pill with what it allows in a tooltip; `*` reads as "Full access". */
export function ScopeBadge({ scope }: { scope: AgentScope }) {
  const t = useT();
  if (scope === "*") return <Badge variant="warning">{t("agents.fullAccess")}</Badge>;
  return (
    <Tooltip content={t(`agents.scopes.${scope}`)}>
      <Badge variant={scopeVariant(scope)}>
        <span className="font-mono text-[0.9em]">{scope}</span>
      </Badge>
    </Tooltip>
  );
}
