import { Banner, InsetPanel, LayerDialog } from "@cloudhal/ui";
import { WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/index.tsx";
import { api, type Member, type SiteRoles } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import { MemberIdentity } from "./MemberDialogs.tsx";
import { RoleBadge } from "./Roles.tsx";
import { capSites, SiteAccessField, siteAccessError } from "./SiteAccessField.tsx";
import { useToast } from "./Toast.ts";
import { MEMBERS_KEY } from "./useMe.ts";

/**
 * Which sites an Editor, Author or Contributor works on (RFC-0034 A2): every site, or only some,
 * each with its role. Saved with `PUT /api/members/:userId/sites`; the change applies at once.
 */
export function MemberSitesDialog({
  member: current,
  onOpenChange,
}: {
  member: Member | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  // Keep showing the member while the dialog animates closed.
  const last = useRef(current);
  if (current) last.current = current;
  const member = current ?? last.current;
  const [sites, setSites] = useState<SiteRoles | undefined>(member?.sites);
  const [submitted, setSubmitted] = useState(false);
  const save = useMutation({
    mutationFn: ({ userId, next }: { userId: string; next: SiteRoles }) =>
      api.members.setSites(userId, next),
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: MEMBERS_KEY });
      onOpenChange(false);
      toast.success(
        t("siteAccess.saved"),
        t("siteAccess.savedDescription", { name: result.member.name }),
      );
    },
  });
  // Each opening starts from the member's current sites.
  useEffect(() => {
    if (current) {
      setSites(current.sites);
      setSubmitted(false);
      save.reset();
    }
  }, [current?.userId]);
  const submit = () => {
    setSubmitted(true);
    if (!member || siteAccessError(sites)) return;
    save.mutate({ userId: member.userId, next: capSites(sites ?? {}, member.role) });
  };

  return (
    <LayerDialog.Root
      open={current !== undefined}
      onOpenChange={onOpenChange}
      dismissDisabled={save.isPending}
    >
      <LayerDialog.Content size="base" closeLabel={t("common.close")}>
        <LayerDialog.Title>{t("siteAccess.title", { name: member?.name ?? "" })}</LayerDialog.Title>
        <LayerDialog.Description>{t("siteAccess.description")}</LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-5">
            {member && (
              <InsetPanel layout="row" label={t("members.role.member")}>
                <MemberIdentity member={member} />
                <RoleBadge value={member.role} />
              </InsetPanel>
            )}
            {save.error && (
              <Banner
                variant="error"
                size="sm"
                icon={<WarningCircle weight="fill" />}
                title={t("siteAccess.failed")}
                description={apiErrorText(t, save.error)}
              />
            )}
            {member && (
              <SiteAccessField
                role={member.role}
                value={sites}
                onChange={setSites}
                error={submitted && siteAccessError(sites) ? t("siteAccess.required") : undefined}
              />
            )}
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary onClick={submit} loading={save.isPending}>
            {t("siteAccess.submit")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
