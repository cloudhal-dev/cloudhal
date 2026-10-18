import type { Redirect } from "@cloudhal/core-contracts";
import {
  Banner,
  DirectionalIcon,
  directional,
  Field,
  Input,
  InputGroup,
  InsetPanel,
  LayerDialog,
  Radio,
  Text,
} from "@cloudhal/ui";
import { ArrowSquareOut, Camera, SignOut } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { type MessageKey, useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import {
  externalHost,
  type FromError,
  normaliseFrom,
  REDIRECT_LIMITS,
  type ToError,
  validateRedirect,
} from "../lib/redirects.ts";
import { ErrorBanner } from "./ErrorBanner.tsx";
import { taxonomyKeys } from "./Taxonomy.tsx";
import { useToast } from "./Toast.ts";

/** Opens elsewhere; mirrors in right-to-left languages (ADR-0033 C1). */
const OpenOutside = directional(ArrowSquareOut);

const FROM_ERROR: Record<FromError, MessageKey> = {
  required: "redirects.errors.fromRequired",
  invalid: "redirects.errors.fromInvalid",
  tooLong: "redirects.errors.fromTooLong",
  taken: "redirects.errors.fromTaken",
  served: "redirects.errors.fromServed",
};
const TO_ERROR: Record<ToError, MessageKey> = {
  required: "redirects.errors.toRequired",
  invalid: "redirects.errors.toInvalid",
  insecure: "redirects.errors.toInsecure",
  tooLong: "redirects.errors.toTooLong",
  self: "redirects.errors.toSelf",
  loop: "redirects.errors.toLoop",
};

/**
 * Create or edit a redirect (DESIGN.md §2p): old path (immutable once created), target (a site
 * path or an https address), "this path only / and below", permanent or temporary (manual
 * redirects only). An external target asks for a second confirmation that names its host.
 */
export function RedirectDialog({
  siteId,
  open,
  onOpenChange,
  editing,
  initialFrom,
  redirects,
  served,
  host,
}: {
  siteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The redirect to edit; absent to create one. */
  editing: Redirect | undefined;
  /** A new redirect prefilled with this old path (a broken link from Analytics). */
  initialFrom?: string | undefined;
  redirects: readonly Redirect[];
  served: ReadonlySet<string>;
  host: string | undefined;
}) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [match, setMatch] = useState<Redirect["match"]>("exact");
  const [status, setStatus] = useState<Redirect["status"]>(301);
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState({ from: false, to: false });
  useEffect(() => {
    if (!open) return;
    setFrom(editing?.from ?? initialFrom ?? "");
    setTo(editing?.to ?? "");
    setMatch(editing?.match ?? "exact");
    setStatus(editing?.status ?? 301);
    setNote(editing?.note ?? "");
    setStep("form");
    setSubmitted(false);
    setTouched({ from: false, to: false });
  }, [open, editing, initialFrom]);
  const manual = !editing || editing.reason === "manual";
  const normalised = editing ? editing.from : normaliseFrom(from);
  const errors = validateRedirect(
    { from: normalised, to },
    { redirects, served, ...(editing ? { selfId: editing.id } : {}) },
  );
  const external = externalHost(to);
  const save = useMutation({
    mutationFn: () => {
      const trimmedNote = note.trim();
      if (editing) {
        const { note: _n, ...rest } = editing;
        return api.redirects.update({
          ...rest,
          to: to.trim(),
          match,
          status: manual ? status : 301,
          ...(trimmedNote ? { note: trimmedNote } : {}),
        });
      }
      return api.redirects.create(siteId, {
        from: normalised,
        to: to.trim(),
        match,
        status,
        ...(trimmedNote ? { note: trimmedNote } : {}),
      });
    },
    onSuccess: async ({ redirect }) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: taxonomyKeys.redirects(siteId) }),
        qc.invalidateQueries({ queryKey: ["snapshots", siteId] }),
      ]);
      toast.success(
        editing ? t("redirects.saved") : t("redirects.created", { from: redirect.from }),
        t("governance.oneSnapshot"),
      );
      onOpenChange(false);
    },
  });
  const submit = () => {
    setSubmitted(true);
    if (errors.from || errors.to) return;
    // A new external host is confirmed once, naming the host (people only; agents never can).
    if (external && step === "form" && externalHost(editing?.to ?? "") !== external) {
      setStep("confirm");
      return;
    }
    save.mutate();
  };
  const showFrom = (submitted || touched.from) && errors.from;
  const showTo = (submitted || touched.to) && errors.to;
  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange} dismissDisabled={save.isPending}>
      <LayerDialog.Content size="base" closeLabel={t("common.close")}>
        <LayerDialog.Title>
          {step === "confirm"
            ? t("redirects.external.title")
            : editing
              ? t("redirects.dialog.editTitle")
              : t("redirects.dialog.createTitle")}
        </LayerDialog.Title>
        <LayerDialog.Description>
          {step === "confirm"
            ? t("redirects.external.description")
            : t("redirects.dialog.description")}
        </LayerDialog.Description>
        <LayerDialog.Body>
          {step === "confirm" ? (
            <div className="grid gap-4" data-testid="redirect-external">
              <Banner
                variant="alert"
                icon={<DirectionalIcon icon={SignOut} weight="fill" />}
                title={t("redirects.external.leave", { host: external ?? "" })}
                description={t("redirects.external.warning")}
              />
              <InsetPanel label={t("redirects.external.target")}>
                <div className="grid gap-1.5">
                  <Text variant="secondary" size="sm" as="span">
                    {t("redirects.external.host")}
                  </Text>
                  <span className="flex items-center gap-2">
                    <OpenOutside size={16} className="shrink-0 text-kumo-subtle" />
                    <Text bold as="span" data-testid="external-host">
                      {external}
                    </Text>
                  </span>
                  <Text variant="mono-secondary" as="span">
                    {normalised} → {to.trim()}
                  </Text>
                </div>
              </InsetPanel>
              <ErrorBanner error={save.error} />
            </div>
          ) : (
            <div className="grid gap-5" data-testid="redirect-form">
              <Field
                label={t("redirects.dialog.from")}
                description={
                  editing ? t("redirects.dialog.fromLocked") : t("redirects.dialog.fromHint")
                }
                error={
                  showFrom
                    ? { message: t(FROM_ERROR[errors.from as FromError]), match: true }
                    : undefined
                }
              >
                <InputGroup className="w-full">
                  {host && <InputGroup.Addon>{host}</InputGroup.Addon>}
                  <InputGroup.Input
                    aria-label={t("redirects.dialog.from")}
                    value={editing ? editing.from : from}
                    readOnly={editing !== undefined}
                    placeholder="/old-address"
                    onChange={(e) => setFrom((e.target as HTMLInputElement).value)}
                    onBlur={() => setTouched((x) => ({ ...x, from: true }))}
                    spellCheck={false}
                    className="font-mono"
                    maxLength={REDIRECT_LIMITS.fromMax}
                    data-testid="redirect-from"
                  />
                </InputGroup>
              </Field>
              <Input
                label={t("redirects.dialog.to")}
                value={to}
                onValueChange={setTo}
                onBlur={() => setTouched((x) => ({ ...x, to: true }))}
                placeholder={t("redirects.dialog.toPlaceholder")}
                description={
                  external
                    ? t("redirects.dialog.toExternal", { host: external })
                    : t("redirects.dialog.toHint")
                }
                error={showTo ? t(TO_ERROR[errors.to as ToError]) : undefined}
                maxLength={REDIRECT_LIMITS.toMax}
                inputMode="url"
                spellCheck={false}
                className="w-full font-mono"
                data-testid="redirect-to"
              />
              <Radio.Group
                appearance="card"
                legend={t("redirects.dialog.match")}
                value={match}
                onValueChange={(v) => setMatch(v as Redirect["match"])}
              >
                <Radio.Item
                  value="exact"
                  label={t("redirects.match.exact")}
                  description={t("redirects.match.exactHint")}
                />
                <Radio.Item
                  value="prefix"
                  label={t("redirects.match.prefix")}
                  description={t("redirects.match.prefixHint")}
                />
              </Radio.Group>
              {manual ? (
                <Radio.Group
                  appearance="card"
                  legend={t("redirects.dialog.status")}
                  value={String(status)}
                  onValueChange={(v) => setStatus(Number(v) as Redirect["status"])}
                >
                  <Radio.Item
                    value="301"
                    label={t("redirects.status.301")}
                    description={t("redirects.status.301Hint")}
                  />
                  <Radio.Item
                    value="302"
                    label={t("redirects.status.302")}
                    description={t("redirects.status.302Hint")}
                  />
                </Radio.Group>
              ) : (
                <Text variant="secondary" size="sm">
                  {t("redirects.dialog.automatic")}
                </Text>
              )}
              <Input
                label={t("redirects.dialog.note")}
                value={note}
                onValueChange={setNote}
                description={t("redirects.dialog.noteHint")}
                maxLength={REDIRECT_LIMITS.noteMax}
                required={false}
                className="w-full"
              />
              <ErrorBanner error={save.error} />
              <div className="flex items-start gap-2">
                <span className="flex h-lh items-center text-kumo-subtle">
                  <Camera size={16} />
                </span>
                <Text variant="secondary" size="sm" as="span">
                  {t("governance.oneSnapshot")}
                </Text>
              </div>
            </div>
          )}
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            loading={save.isPending}
            onClick={submit}
            data-testid="redirect-submit"
          >
            {step === "confirm"
              ? t("redirects.external.confirm", { host: external ?? "" })
              : editing
                ? t("common.saveChanges")
                : t("redirects.dialog.create")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
