import { Badge, Banner, Checkbox, Radio, SectionCard, Table, Text, Tooltip } from "@cloudhal/ui";
import {
  ClockCountdown,
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
import { useI18n, useT } from "../i18n/index.tsx";
import {
  ALWAYS_GATED_TOOLS,
  autoApprovalCount,
  MODE_RISK,
  MODE_RULES,
  type ModeRisk,
  type ModeRule,
  modeVariant,
} from "../lib/agents.ts";
import type { AgentMode, AuditElevation, AuditRow, KeyMode } from "../lib/api.ts";
import { formatUntil } from "../lib/elevation.ts";
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
 * `elevation` marks a mode that was temporary (ADR-0016): a timer inside the pill, and the tooltip
 * leads with "Temporarily elevated from Edits until 14:30".
 */
export function ModeBadge({
  mode,
  subtle = false,
  elevation,
}: {
  mode: AgentMode;
  subtle?: boolean;
  elevation?: AuditElevation | undefined;
}) {
  const { t, locale } = useI18n();
  return (
    <span data-mode={mode} data-elevated={elevation ? "true" : undefined} className="inline-flex">
      <Tooltip
        content={
          elevation ? (
            <span className="grid max-w-72 gap-1.5">
              <Text as="span" size="sm" bold>
                {t("agents.elevation.marker", {
                  from: t(`agents.modes.names.${elevation.from}`),
                  time: formatUntil(elevation.until, locale),
                })}
              </Text>
              <ModeSummary mode={mode} />
            </span>
          ) : (
            <ModeSummary mode={mode} />
          )
        }
      >
        <Badge variant={subtle ? "outline" : modeVariant(mode)} icon={<ModeIcon mode={mode} />}>
          {t(`agents.modes.names.${mode}`)}
          {elevation && (
            <ClockCountdown
              size={12}
              weight="bold"
              role="img"
              aria-label={t("agents.elevation.temporary")}
              data-testid="elevation-marker"
            />
          )}
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
  only,
}: {
  value: KeyMode;
  onValueChange: (mode: KeyMode) => void;
  /** The key's mode today (change dialog): marked "Current". */
  current?: KeyMode | undefined;
  legend: string;
  /** Offer only these of the server's key modes (elevation: the ones above the key's own). */
  only?: readonly KeyMode[] | undefined;
}) {
  const t = useT();
  const rules = useAgentModeRules();
  // Only the modes the person's role may give a key (RFC-0005 §5.2); the cap is said below.
  const modes = only ? rules.keyModes.filter((m) => only.includes(m)) : rules.keyModes;
  return (
    <div className="grid gap-3">
      <Radio.Group
        appearance="card"
        value={value}
        onValueChange={(v) => onValueChange(v as KeyMode)}
      >
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
      {rules.cap && <RoleCapHint cap={rules.cap} />}
    </div>
  );
}

/** "Your role allows keys up to Edits mode." — under a capped mode picker (RFC-0005 §5.2). */
export function RoleCapHint({ cap }: { cap: KeyMode }) {
  const t = useT();
  return (
    <div className="flex items-start gap-2" data-testid="role-cap">
      <span className="flex h-lh items-center text-kumo-subtle">
        <ShieldCheck size={16} />
      </span>
      <Text variant="secondary" size="sm">
        {t("agents.roleCap", { mode: t(`agents.modes.names.${cap}`) })}
      </Text>
    </div>
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
 * A flush `SectionCard`: the table runs edge to edge, the notes below it keep the card's padding.
 */
export function HowModesWorkCard() {
  const t = useT();
  const { modes } = useAgentModeRules();
  return (
    <SectionCard
      id="how-modes"
      title={t("agents.howModes.title")}
      icon={<SlidersHorizontal size={16} />}
      description={t("agents.howModes.description")}
      flush
    >
      {/* Tighter cells than Kumo's p-3 so four columns fit the 380 px side column (and a phone) in
          English and Turkish; the first column keeps the card's px-5 edge. */}
      <Table className="[&_td]:px-1 [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th]:px-1 [&_th]:align-bottom [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
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
      <div className="grid gap-4 border-kumo-hairline border-t px-5 pt-4 pb-5">
        <div className="grid gap-2">
          <Text size="sm" bold as="span">
            {t("agents.howModes.gated")}
          </Text>
          <dl className="grid gap-1.5">
            {ALWAYS_GATED_TOOLS.map((tool) => (
              <div key={tool} className="flex items-center justify-between gap-3">
                <dt>
                  <Text as="span">{t(`tools.${tool}`)}</Text>
                </dt>
                <dd>
                  <Text variant="mono-secondary" as="span">
                    {tool}
                  </Text>
                </dd>
              </div>
            ))}
          </dl>
        </div>
        {/* Prefer a time-boxed elevation over a permanent Auto key (ADR-0016). */}
        <div className="flex items-start gap-2" data-testid="how-elevation">
          <span className="flex h-lh items-center text-kumo-subtle">
            <ClockCountdown size={16} />
          </span>
          <Text variant="secondary" size="sm">
            {t("agents.elevation.howModes")}
          </Text>
        </div>
        <div className="flex items-start gap-2">
          <span className="flex h-lh items-center text-kumo-subtle">
            <ModeIcon mode="bypass" />
          </span>
          <Text variant="secondary" size="sm">
            {t("agents.howModes.bypass")}{" "}
            <span className="font-mono text-[0.9em] whitespace-nowrap text-kumo-default [font-variant-ligatures:none]">
              {BYPASS_COMMAND}
            </span>
          </Text>
        </div>
      </div>
    </SectionCard>
  );
}
