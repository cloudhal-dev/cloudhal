import {
  Banner,
  ClipboardText,
  Input,
  InsetPanel,
  LayerDialog,
  Radio,
  Select,
  Text,
} from "@cloudhal/ui";
import {
  CheckCircle,
  ClockCountdown,
  EnvelopeSimple,
  LinkSimple,
  ShieldWarning,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { absoluteTime } from "../lib/activity.ts";
import { api, type CreatedInvite, errorCode, type Role, type SiteRoles } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import { formatDuration } from "../lib/elevation.ts";
import {
  expiresIn,
  inviteDefaultHours,
  inviteMaxHours,
  invitePresets,
  validEmail,
} from "../lib/roles.ts";
import { RoleBadge, RoleExplainer } from "./Roles.tsx";
import { capSites, isSiteRole, SiteAccessField, siteAccessError } from "./SiteAccessField.tsx";
import { useInviteRules, useMe } from "./useMe.ts";

/** What re-inviting starts from: the pending invite it replaces. */
export interface InviteDraft {
  email: string;
  role: Role;
}

const API_ERRORS = [
  "rank",
  "invalid_expiry",
  "delivery_unavailable",
  "delivery_failed",
  "already_member",
  "too_many_invites",
  "rate_limited",
] as const;
type InviteErrorCode = (typeof API_ERRORS)[number];

function inviteErrorOf(error: unknown): InviteErrorCode | undefined {
  const code = errorCode(error);
  return (API_ERRORS as readonly string[]).includes(code ?? "")
    ? (code as InviteErrorCode)
    : undefined;
}

/**
 * Invite someone (DESIGN.md §2q, RFC-0005 §7) in one `LayerDialog`, two steps:
 * 1. who and as what — email, a role `Select` limited to the roles the inviter may give (with the
 *    role explainer under it), the link's lifetime within the server's bounds (Administrator
 *    invites at most 72 h) and, when the server can send email, how it is delivered;
 * 2. the link, shown **once** (like an agent key): copy it, see when it expires, share it privately.
 * The link lives only in this component's state and is dropped when the dialog closes. Re-inviting
 * (`draft`) replaces the pending invite for that email.
 */
export function InviteDialog({
  open,
  onOpenChange,
  draft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Re-invite: prefill from the invite it replaces. */
  draft?: InviteDraft | undefined;
}) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const me = useMe().data;
  const rules = useInviteRules();
  const roles = me?.invitableRoles ?? [];
  const firstRole: Role = roles.includes("author") ? "author" : (roles.at(-1) ?? "contributor");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(firstRole);
  const [hours, setHours] = useState(() => inviteDefaultHours(rules, firstRole));
  const [delivery, setDelivery] = useState<"link" | "email">("link");
  const [submitted, setSubmitted] = useState(false);
  const [created, setCreated] = useState<CreatedInvite | undefined>();
  const [sites, setSites] = useState<SiteRoles | undefined>();

  const create = useMutation({
    mutationFn: () =>
      api.invites.create({
        email: email.trim().toLowerCase(),
        role,
        expiresInHours: hours,
        ...(delivery === "email" ? { delivery } : {}),
        ...(sites && isSiteRole(role) ? { sites: capSites(sites, role) } : {}),
      }),
    onSuccess: async (result) => {
      setCreated(result);
      await qc.invalidateQueries({ queryKey: ["invites"] });
    },
  });

  // Every opening starts clean (or from the invite being replaced); closing forgets the link.
  useEffect(() => {
    if (open) {
      const start = draft && roles.includes(draft.role) ? draft.role : firstRole;
      setEmail(draft?.email ?? "");
      setRole(start);
      setHours(inviteDefaultHours(rules, start));
      setDelivery("link");
      setSites(undefined);
      setSubmitted(false);
      create.reset();
    } else {
      setCreated(undefined);
    }
  }, [open]);

  const presets = invitePresets(rules, role);
  const chooseRole = (next: Role) => {
    setRole(next);
    // Keep the chosen lifetime when it still fits; Administrator invites are capped.
    if (!invitePresets(rules, next).includes(hours as never))
      setHours(inviteDefaultHours(rules, next));
  };
  const emailError =
    submitted && !validEmail(email)
      ? email.trim()
        ? t("invites.errors.emailInvalid")
        : t("invites.errors.emailRequired")
      : undefined;
  const submit = () => {
    setSubmitted(true);
    if (create.isPending || !validEmail(email) || !roles.includes(role)) return;
    if (isSiteRole(role) && siteAccessError(sites)) return;
    create.mutate();
  };
  const apiError = inviteErrorOf(create.error);
  const roleName = t(`roles.names.${role}`);
  const emailOffered = rules.delivery.includes("email");

  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange} dismissDisabled={create.isPending}>
      <LayerDialog.Content size="base" closeLabel={t("common.close")}>
        <LayerDialog.Title>
          {created
            ? created.url
              ? t("invites.reveal.title")
              : t("invites.reveal.sentTitle")
            : draft
              ? t("invites.create.reinviteTitle")
              : t("invites.create.title")}
        </LayerDialog.Title>
        <LayerDialog.Description>
          {created
            ? t("invites.reveal.description", {
                email: created.invite.email,
                role: t(`roles.names.${created.invite.role}`),
              })
            : t("invites.create.description")}
        </LayerDialog.Description>
        <LayerDialog.Body>
          {created ? (
            <InviteReveal created={created} />
          ) : (
            // No <form>: Kumo's Radio cards are buttons; Enter in the email field submits.
            <div className="grid gap-5" data-testid="invite-step-details">
              <Text variant="secondary" size="sm">
                {t("invites.create.step")}
              </Text>
              {create.error && (
                <Banner
                  variant="error"
                  size="sm"
                  icon={<WarningCircle weight="fill" />}
                  title={t("invites.create.failed")}
                  description={
                    apiError
                      ? t(`invites.errors.${apiError}`, { email: email.trim(), role: roleName })
                      : apiErrorText(t, create.error)
                  }
                />
              )}
              <Input
                className="w-full"
                label={t("invites.create.email")}
                description={t("invites.create.emailHint")}
                placeholder={t("invites.create.emailPlaceholder")}
                type="email"
                inputMode="email"
                autoComplete="off"
                value={email}
                onValueChange={setEmail}
                error={emailError}
                autoFocus
                maxLength={254}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <div className="@container">
                <div className="grid items-start gap-5 @md:grid-cols-2">
                  <Select
                    className="w-full"
                    label={t("invites.create.role")}
                    description={t("invites.create.roleHint")}
                    value={role}
                    onValueChange={(v) => chooseRole(v as Role)}
                    items={Object.fromEntries(roles.map((r) => [r, t(`roles.names.${r}`)]))}
                  />
                  <Select
                    className="w-full"
                    label={t("invites.create.expiry")}
                    description={
                      role === "administrator"
                        ? t("invites.create.expiryAdmin", {
                            max: formatDuration(inviteMaxHours(rules, role) * 60, locale, "long"),
                          })
                        : t("invites.create.expiryHint")
                    }
                    value={String(hours)}
                    onValueChange={(v) => setHours(Number(v))}
                    items={Object.fromEntries(
                      presets.map((h) => [String(h), formatDuration(h * 60, locale, "long")]),
                    )}
                  />
                </div>
              </div>
              <SiteAccessField
                role={role}
                value={sites}
                onChange={setSites}
                error={submitted && siteAccessError(sites) ? t("siteAccess.required") : undefined}
              />
              <div className="grid min-w-0 gap-2" data-testid="role-explainer">
                <Text size="sm" bold as="span">
                  {t("invites.create.explainer")}
                </Text>
                <div className="-mx-1 min-w-0 overflow-x-auto">
                  <RoleExplainer roles={roles} selected={role} />
                </div>
              </div>
              {emailOffered && (
                <Radio.Group
                  appearance="card"
                  value={delivery}
                  onValueChange={(v) => setDelivery(v as "link" | "email")}
                >
                  <Radio.Legend>{t("invites.create.delivery")}</Radio.Legend>
                  <Radio.Item
                    value="link"
                    label={
                      <span className="flex items-center gap-2">
                        <LinkSimple size={16} className="text-kumo-subtle" />
                        {t("invites.create.deliveryLink")}
                      </span>
                    }
                    description={t("invites.create.deliveryLinkHint")}
                  />
                  <Radio.Item
                    value="email"
                    label={
                      <span className="flex items-center gap-2">
                        <EnvelopeSimple size={16} className="text-kumo-subtle" />
                        {t("invites.create.deliveryEmail")}
                      </span>
                    }
                    description={t("invites.create.deliveryEmailHint")}
                  />
                </Radio.Group>
              )}
            </div>
          )}
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={created ? t("common.close") : t("common.cancel")}>
          {created ? (
            <LayerDialog.Actions.Primary onClick={() => onOpenChange(false)}>
              {created.url ? t("invites.reveal.done") : t("common.close")}
            </LayerDialog.Actions.Primary>
          ) : (
            <LayerDialog.Actions.Primary onClick={submit} loading={create.isPending}>
              {delivery === "email" ? t("invites.create.send") : t("invites.create.submit")}
            </LayerDialog.Actions.Primary>
          )}
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

/** Step 2: the link, shown once (or "sent"), with what it grants and when it expires. */
function InviteReveal({ created }: { created: CreatedInvite }) {
  const { t, locale } = useI18n();
  const expiresAt = created.invite.expiresAt;
  return (
    <div className="grid gap-5" data-testid="invite-reveal">
      {created.url ? (
        <>
          <Banner
            variant="alert"
            icon={<Warning weight="fill" />}
            title={t("invites.reveal.warningTitle")}
            description={t("invites.reveal.warning", {
              role: t(`roles.names.${created.invite.role}`),
            })}
          />
          <div className="grid min-w-0 gap-1.5">
            <Text size="sm" bold as="span">
              {t("invites.reveal.link")}
            </Text>
            <ClipboardText
              size="lg"
              text={created.url}
              tooltip={{ text: t("common.copy"), copiedText: t("common.copied") }}
            />
          </div>
        </>
      ) : (
        <Banner
          variant="default"
          icon={<CheckCircle weight="fill" />}
          title={t("invites.reveal.sent", { email: created.invite.email })}
          description={t("invites.reveal.sentDescription")}
        />
      )}
      <InsetPanel label={t("invites.reveal.summary")}>
        <div className="flex flex-wrap items-center gap-2">
          <RoleBadge value={created.invite.role} />
          <Text as="span" truncate>
            {created.invite.email}
          </Text>
        </div>
        {expiresAt && (
          <div className="flex items-start gap-2">
            <span className="flex h-lh items-center text-kumo-subtle">
              <ClockCountdown size={16} />
            </span>
            <Text variant="secondary" size="sm">
              {t("invites.reveal.expires", {
                relative: expiresIn(expiresAt, locale),
                absolute: absoluteTime(expiresAt, locale),
              })}
            </Text>
          </div>
        )}
        <div className="flex items-start gap-2">
          <span className="flex h-lh items-center text-kumo-subtle">
            <ShieldWarning size={16} />
          </span>
          <Text variant="secondary" size="sm">
            {t("invites.reveal.private")}
          </Text>
        </div>
      </InsetPanel>
    </div>
  );
}
