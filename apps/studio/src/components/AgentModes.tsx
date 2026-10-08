import { Badge, Banner, Checkbox, LayerCard, Radio, Table, Text, Tooltip } from "@cloudhal/ui";
import {
  Eye,
  HandPalm,
  type Icon,
  Lightning,
  LockSimpleOpen,
  PencilSimple,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  UserCheck,
  Warning,
} from "@phosphor-icons/react";
import { useT } from "../i18n/index.tsx";
import {
  ALWAYS_GATED_TOOLS,
  autoApprovalCount,
  MODE_RISK,
  MODE_RULES,
  type ModeRisk,
  type ModeRule,
  modeVariant,
} from "../lib/agents.ts";
import type { AgentMode, AuditRow, KeyMode } from "../lib/api.ts";
import { useAgentModeRules } from "./useAgentModeRules.ts";

/** The only way to get `bypass` (ADR-0015): the local stdio server, never an API key. */
export const BYPASS_COMMAND = "cloudhal mcp --mode bypass";

const MODE_ICON: Record<AgentMode, Icon> = {
  plan: Eye,
  manual: UserCheck,
  edits: PencilSimple,
  auto: Lightning,
  bypass: LockSimpleOpen,
};

const RISK: Record<ModeRisk, { variant: "success" | "info" | "warning"; icon: Icon }> = {
  safest: { variant: "success", icon: ShieldCheck },
  recommended: { variant: "info", icon: Star },
  caution: { variant: "warning", icon: Warning },
};

export function ModeIcon({ mode, size = 16 }: { mode: AgentMode; size?: number }) {
  const Glyph = MODE_ICON[mode];
  return <Glyph size={size} />;
}

/** What a mode means, for tooltips: one line on behaviour, one on what waits for a person. */
function ModeSummary({ mode }: { mode: AgentMode }) {
  const t = useT();
  return (
    <span className="grid max-w-72 gap-1">
      <span>{t(`agents.modes.descriptions.${mode}`)}</span>
      <span>
        {t("agents.modes.waitsLabel")} {t(`agents.modes.waits.${mode}`)}
      </span>
    </span>
  );
}

/**
 * Mode pill with an explanation in a tooltip. Semantic tone by autonomy (DESIGN.md §2g); `subtle`
 * is the outline form for dense audit cells, where the decision badge must stay the loudest.
 */
export function ModeBadge({ mode, subtle = false }: { mode: AgentMode; subtle?: boolean }) {
  const t = useT();
  return (
    <span data-mode={mode} className="inline-flex">
      <Tooltip content={<ModeSummary mode={mode} />}>
        <Badge variant={subtle ? "outline" : modeVariant(mode)} icon={<ModeIcon mode={mode} />}>
          {t(`agents.modes.names.${mode}`)}
        </Badge>
      </Tooltip>
    </span>
  );
}

function RiskBadge({ risk }: { risk: ModeRisk }) {
  const t = useT();
  const r = RISK[risk];
  return (
    <span data-risk={risk} className="inline-flex">
      <Badge variant={r.variant} icon={<r.icon weight="fill" />}>
        {t(`agents.modes.risk.${risk}`)}
      </Badge>
    </span>
  );
}

/**
 * Mode radio cards (DESIGN.md §2g "Mode picker"): icon, name, risk badge, a one-line description
 * and what waits for the owner. Only the modes an API key may hold; bypass is explained, not offered.
 */
export function ModePicker({
  value,
  onValueChange,
  current,
  legend,
}: {
  value: KeyMode;
  onValueChange: (mode: KeyMode) => void;
  /** The key's mode today (change dialog): marked "Current". */
  current?: KeyMode | undefined;
  legend: string;
}) {
  const t = useT();
  const { modes } = useAgentModeRules();
  return (
    <Radio.Group appearance="card" value={value} onValueChange={(v) => onValueChange(v as KeyMode)}>
      <Radio.Legend className="sr-only">{legend}</Radio.Legend>
      {modes.map((mode) => (
        <Radio.Item
          key={mode}
          value={mode}
          label={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1" data-mode-option={mode}>
              <span className="flex h-lh items-center text-kumo-subtle">
                <ModeIcon mode={mode} />
              </span>
              <span>{t(`agents.modes.names.${mode}`)}</span>
              <RiskBadge risk={MODE_RISK[mode]} />
              {current === mode && <Badge variant="outline">{t("agents.modes.current")}</Badge>}
            </span>
          }
          description={
            <span className="grid gap-1.5 pt-0.5">
              <span>{t(`agents.modes.descriptions.${mode}`)}</span>
              <span className="flex items-start gap-1.5">
                <span className="flex h-lh items-center">
                  <HandPalm size={14} />
                </span>
                <span>
                  <Text as="span" size="sm" bold>
                    {t("agents.modes.waitsLabel")}
                  </Text>{" "}
                  {t(`agents.modes.waits.${mode}`)}
                </span>
              </span>
            </span>
          }
        />
      ))}
    </Radio.Group>
  );
}

/** "Bypass exists, but only locally" — shown under every mode picker. */
export function BypassHint() {
  const t = useT();
  return (
    <div className="flex items-start gap-2" data-testid="bypass-hint">
      <span className="flex h-lh items-center text-kumo-subtle">
        <ModeIcon mode="bypass" />
      </span>
      <Text variant="secondary" size="sm">
        {t("agents.modes.bypassHint")}{" "}
        <span className="font-mono text-[0.9em] whitespace-nowrap text-kumo-default [font-variant-ligatures:none]">
          {BYPASS_COMMAND}
        </span>
      </Text>
    </div>
  );
}

/**
 * Explicit consent before a key may publish without its owner: an alert explaining the low-risk
 * rule and a checkbox the person must tick. No `<form>` around it (Kumo's Checkbox is a button).
 */
export function AutoModeConfirm({
  checked,
  onCheckedChange,
  showError,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  showError: boolean;
}) {
  const t = useT();
  const { autoPublishLimit } = useAgentModeRules();
  const error = showError && !checked;
  return (
    <div className="grid gap-3" data-testid="auto-confirm">
      <Banner
        variant="alert"
        icon={<Lightning weight="fill" />}
        title={t("agents.modes.autoTitle")}
        description={t("agents.modes.autoDescription", { limit: autoPublishLimit })}
      />
      <div className="grid gap-1.5">
        <Checkbox
          checked={checked}
          onCheckedChange={(on) => onCheckedChange(on === true)}
          variant={error ? "error" : "default"}
          label={t("agents.modes.autoConfirm")}
        />
        {error && (
          <Text variant="error" size="sm">
            {t("agents.modes.autoConfirmRequired")}
          </Text>
        )}
      </div>
    </div>
  );
}

/** An `auto`-mode publish that went live without a person (the audit row's `autoCheck`). */
export function AutoApprovedBadge({ row }: { row: Pick<AuditRow, "reason" | "autoCheck"> }) {
  const t = useT();
  const count = autoApprovalCount(row);
  return (
    <span data-auto-approved="true" className="inline-flex">
      <Tooltip
        content={
          <span className="grid max-w-72 gap-1">
            <span>{t("activity.autoApprovedHint")}</span>
            {count !== undefined && <span>{t("activity.autoApprovedCount", { count })}</span>}
          </span>
        }
      >
        <Badge variant="warning" icon={<Lightning weight="fill" />}>
          {t("activity.autoApproved")}
        </Badge>
      </Tooltip>
    </span>
  );
}

const RULE_VARIANT: Record<ModeRule, "neutral" | "warning" | "success"> = {
  denied: "neutral",
  waits: "warning",
  free: "success",
  lowRisk: "success",
};

function RuleBadge({ rule }: { rule: ModeRule }) {
  const t = useT();
  const { autoPublishLimit } = useAgentModeRules();
  return (
    <span data-rule={rule} className="inline-flex">
      <Tooltip
        content={
          <span className="block max-w-64">
            {t(`agents.howModes.rulesHint.${rule}`, { limit: autoPublishLimit })}
          </span>
        }
      >
        <Badge variant={RULE_VARIANT[rule]} appearance="dot">
          {t(`agents.howModes.rules.${rule}`)}
        </Badge>
      </Tooltip>
    </span>
  );
}

/**
 * "How modes work" (Agents page side column): the ADR-0015 table — what each key mode does with
 * content edits, publishes and rollback/deletes — plus the tools that always wait for a person.
 */
export function HowModesWorkCard() {
  const t = useT();
  const { modes } = useAgentModeRules();
  return (
    <LayerCard data-testid="how-modes">
      <LayerCard.Secondary className="flex items-center gap-2 px-5 py-3">
        <SlidersHorizontal size={16} className="text-kumo-subtle" />
        <Text variant="heading" as="h2">
          {t("agents.howModes.title")}
        </Text>
      </LayerCard.Secondary>
      <LayerCard.Primary className="grid min-w-0 gap-0 p-0">
        <div className="px-5 pt-4 pb-3">
          <Text variant="secondary">{t("agents.howModes.description")}</Text>
        </div>
        <div className="min-w-0 overflow-x-auto border-y border-kumo-hairline">
          {/* Tighter cells than Kumo's p-3 so four columns fit the 380 px side column; the first
              column keeps the card's px-5 edge. */}
          <Table className="[&_td]:px-2 [&_td:first-child]:pl-5 [&_th]:px-2 [&_th:first-child]:pl-5">
            <Table.Header variant="compact">
              <Table.Row>
                <Table.Head>{t("agents.howModes.columns.mode")}</Table.Head>
                <Table.Head>{t("agents.howModes.columns.edits")}</Table.Head>
                <Table.Head>{t("agents.howModes.columns.publish")}</Table.Head>
                <Table.Head>{t("agents.howModes.columns.rollback")}</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {modes.map((mode) => (
                <Table.Row key={mode} data-mode-row={mode}>
                  <Table.Cell className="whitespace-nowrap">
                    <Text as="span" bold>
                      {t(`agents.modes.names.${mode}`)}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <RuleBadge rule={MODE_RULES[mode].edits} />
                  </Table.Cell>
                  <Table.Cell>
                    <RuleBadge rule={MODE_RULES[mode].publish} />
                  </Table.Cell>
                  <Table.Cell>
                    <RuleBadge rule={MODE_RULES[mode].rollback} />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
        <div className="grid gap-3 px-5 py-4">
          <div className="grid gap-2">
            <Text size="sm" bold as="span">
              {t("agents.howModes.gated")}
            </Text>
            {ALWAYS_GATED_TOOLS.map((tool) => (
              <div key={tool} className="flex items-center justify-between gap-3">
                <Text as="span">{t(`tools.${tool}`)}</Text>
                <Text variant="mono-secondary" as="span">
                  {tool}
                </Text>
              </div>
            ))}
          </div>
          <Text variant="secondary" size="sm">
            {t("agents.howModes.bypass")}{" "}
            <span className="font-mono text-[0.9em] whitespace-nowrap text-kumo-default [font-variant-ligatures:none]">
              {BYPASS_COMMAND}
            </span>
          </Text>
        </div>
      </LayerCard.Primary>
    </LayerCard>
  );
}
