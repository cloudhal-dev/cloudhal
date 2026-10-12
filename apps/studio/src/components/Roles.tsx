import { Badge, Table, Text, Tooltip } from "@cloudhal/ui";
import {
  Crown,
  Feather,
  type Icon,
  NotePencil,
  PencilSimpleLine,
  ShieldStar,
} from "@phosphor-icons/react";
import { type MessageKey, useT } from "../i18n/index.tsx";
import type { Role } from "../lib/api.ts";
import { type RoleRules, roleCan } from "../lib/roles.ts";
import { useRoleRules } from "./useMe.ts";

const ROLE_ICON: Record<Role, Icon> = {
  owner: Crown,
  administrator: ShieldStar,
  editor: PencilSimpleLine,
  author: Feather,
  contributor: NotePencil,
};

/** Tint by seniority: the two who run the deployment stand out, writers stay quiet (DESIGN.md §4). */
const ROLE_VARIANT: Record<Role, "info" | "secondary" | "outline"> = {
  owner: "info",
  administrator: "info",
  editor: "secondary",
  author: "secondary",
  contributor: "outline",
};

/** A role's 16 px icon. (`value`, not `role`: that name is an ARIA attribute on elements.) */
export function RoleIcon({ value, size = 16 }: { value: Role; size?: number }) {
  const Glyph = ROLE_ICON[value];
  return <Glyph size={size} />;
}

/**
 * A staff role as a badge with what it may do in a tooltip (RFC-0005 §10.3: Members, the account
 * menu, Approvals, Activity). Carries `data-role` for tests.
 */
export function RoleBadge({ value: role, tooltip = true }: { value: Role; tooltip?: boolean }) {
  const t = useT();
  const badge = (
    <Badge variant={ROLE_VARIANT[role]} icon={<RoleIcon value={role} />}>
      {t(`roles.names.${role}`)}
    </Badge>
  );
  return (
    <span data-role={role} className="inline-flex">
      {tooltip ? (
        <Tooltip content={<span className="block max-w-64">{t(`roles.summaries.${role}`)}</span>}>
          {badge}
        </Tooltip>
      ) : (
        badge
      )}
    </span>
  );
}

/**
 * The roles as a divided list — badge, then one sentence on what it may do — for the Team page's
 * side column, where the explainer table has no room. `current` marks the person's own role.
 */
export function RoleList({ roles, current }: { roles: readonly Role[]; current?: Role }) {
  const t = useT();
  return (
    <div className="divide-y divide-kumo-hairline">
      {roles.map((role) => (
        <div key={role} className="grid gap-1.5 px-5 py-3" data-role-row={role}>
          <span className="flex flex-wrap items-center gap-2">
            <RoleBadge value={role} tooltip={false} />
            {current === role && (
              <Text variant="secondary" size="sm" as="span">
                {t("roles.yours")}
              </Text>
            )}
          </span>
          <Text variant="secondary" size="sm">
            {t(`roles.summaries.${role}`)}
          </Text>
        </div>
      ))}
    </div>
  );
}

type Level = "all" | "own" | "drafts" | "none" | "invite" | "full";

/** Dot tones like the "How modes work" table: full green, limited amber, none grey. */
const LEVEL_VARIANT: Record<Level, "success" | "warning" | "neutral"> = {
  all: "success",
  full: "success",
  own: "warning",
  drafts: "warning",
  invite: "warning",
  none: "neutral",
};

/** The explainer's columns, each worked out from the server's ability map for a role. */
const COLUMNS = {
  articles: (rules: RoleRules, role: Role): Level =>
    roleCan(rules, role, "entries.editAny")
      ? "all"
      : roleCan(rules, role, "entries.editOwnPublished")
        ? "own"
        : roleCan(rules, role, "entries.create")
          ? "drafts"
          : "none",
  publish: (rules: RoleRules, role: Role): Level =>
    roleCan(rules, role, "publish.any")
      ? "all"
      : roleCan(rules, role, "publish.own")
        ? "own"
        : "none",
  structure: (rules: RoleRules, role: Role): Level =>
    roleCan(rules, role, "structure.write") && roleCan(rules, role, "pages.write") ? "all" : "none",
  team: (rules: RoleRules, role: Role): Level =>
    roleCan(rules, role, "members.manage") && roleCan(rules, role, "settings.write")
      ? "full"
      : roleCan(rules, role, "members.invite")
        ? "invite"
        : "none",
} as const;
type Column = keyof typeof COLUMNS;

function LevelBadge({ column, level }: { column: Column; level: Level }) {
  const t = useT();
  return (
    <span data-level={level} className="inline-flex">
      <Tooltip
        content={
          <span className="block max-w-64">
            {/* Each column has words only for the levels it can reach. */}
            {t(`roles.explainer.hints.${column}.${level}` as MessageKey)}
          </span>
        }
      >
        <Badge variant={LEVEL_VARIANT[level]} appearance="dot">
          {t(`roles.explainer.levels.${level}`)}
        </Badge>
      </Tooltip>
    </span>
  );
}

/**
 * What each role can do, from the server's ability map (`/api/instance` → `roles.abilities`): one
 * row per role, columns for articles, publishing, structure and the team, each a dot `Badge` with
 * a tooltip. Used in the invite dialog (only the roles the inviter may give) and the Team page.
 * Kumo's cell padding is tightened so it fits a dialog and a phone; the caller scrolls it sideways
 * when it does not.
 */
export function RoleExplainer({ roles, selected }: { roles: readonly Role[]; selected?: Role }) {
  const t = useT();
  const rules = useRoleRules();
  const columns = Object.keys(COLUMNS) as Column[];
  return (
    <Table className="[&_td]:px-1.5 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th]:px-1.5 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
      <Table.Header variant="compact">
        <Table.Row>
          <Table.Head>{t("roles.explainer.role")}</Table.Head>
          {columns.map((c) => (
            <Table.Head key={c}>{t(`roles.explainer.columns.${c}`)}</Table.Head>
          ))}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {roles.map((role) => (
          <Table.Row
            key={role}
            data-role-row={role}
            variant={selected === role ? "selected" : "default"}
          >
            <Table.Cell className="whitespace-nowrap">
              <span className="flex items-center gap-2">
                <span className="flex text-kumo-subtle">
                  <RoleIcon value={role} />
                </span>
                <Text as="span" bold>
                  {t(`roles.names.${role}`)}
                </Text>
              </span>
            </Table.Cell>
            {columns.map((c) => (
              <Table.Cell key={c} className="whitespace-nowrap">
                <LevelBadge column={c} level={COLUMNS[c](rules, role)} />
              </Table.Cell>
            ))}
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}
