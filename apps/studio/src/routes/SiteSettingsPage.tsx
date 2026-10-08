import type { Site, Snapshot } from "@cloudhal/core-contracts";
import {
  Badge,
  Banner,
  Button,
  ClipboardText,
  DropdownMenu,
  InlineCopyText,
  Input,
  InputGroup,
  InsetPanel,
  LinkButton,
  PageLayout,
  Radio,
  SectionEmpty,
  Select,
  SkeletonLine,
  Table,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import {
  ArrowClockwise,
  ArrowSquareOut,
  DotsThree,
  Globe,
  Info,
  LinkSimple,
  Plus,
  Star,
  Trash,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ReadOnly, ViewOnlyBanner } from "../components/Gating.tsx";
import { SettingRow, SettingsLayout, SettingsSection } from "../components/Settings.tsx";
import { useToast } from "../components/Toast.ts";
import { useGate } from "../components/useMe.ts";
import { useI18n, useT } from "../i18n/index.tsx";
import { NAME_MAX, validateName } from "../lib/account.ts";
import { absoluteTime } from "../lib/activity.ts";
import {
  ApiRequestError,
  api,
  isNotEnabled,
  type PreviewLink,
  type PreviewLinkInput,
} from "../lib/api.ts";
import {
  addDomain,
  applyGeneral,
  type Domain,
  makePrimary,
  normalizeHostname,
  normalizePreviewPath,
  PREVIEW_TTLS,
  type PreviewTtl,
  primaryHostname,
  removeDomain,
  sortDomains,
  ttlSeconds,
  validateHostname,
} from "../lib/site-settings.ts";

const SECTIONS = ["general", "domains", "previews"] as const;
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isConflict = (e: unknown) => e instanceof ApiRequestError && e.status === 409;

/** Saves a whole Site document (PUT, CAS on `rev`) and keeps every cached copy in step. */
function useSaveSite(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (site: Site) => api.sites.update(site),
    onSuccess: async (saved) => {
      qc.setQueryData(["site", siteId], saved);
      await qc.invalidateQueries({ queryKey: ["sites"] });
    },
  });
}

/** 409 from the CAS: explain and offer the latest version (DESIGN.md §5, Error). */
function ConflictBanner({ onReload, reloading }: { onReload: () => void; reloading: boolean }) {
  const t = useT();
  return (
    <div role="alert">
      <Banner
        variant="alert"
        icon={<Warning weight="fill" />}
        title={t("siteSettings.conflictTitle")}
        description={t("siteSettings.conflictDescription")}
        action={
          <Banner.Action
            variant="secondary"
            icon={<ArrowClockwise />}
            onClick={onReload}
            loading={reloading}
          >
            {t("siteSettings.loadLatest")}
          </Banner.Action>
        }
      />
    </div>
  );
}

function SaveError({
  error,
  title,
  onReload,
  reloading,
}: {
  error: unknown;
  title: string;
  onReload: () => void;
  reloading: boolean;
}) {
  if (!error) return null;
  if (isConflict(error)) return <ConflictBanner onReload={onReload} reloading={reloading} />;
  return (
    <Banner
      variant="error"
      size="sm"
      icon={<WarningCircle weight="fill" />}
      title={title}
      description={errorMessage(error)}
    />
  );
}

function SectionSkeleton() {
  const t = useT();
  return (
    <div className="grid gap-3" role="status">
      <span className="sr-only">{t("common.loading")}</span>
      <SkeletonLine minWidth={30} maxWidth={45} />
      <SkeletonLine minWidth={60} maxWidth={85} />
      <SkeletonLine minWidth={50} maxWidth={70} />
    </div>
  );
}

/** A muted info line in a card (icon aligned with the first line of text). */
function InfoLine({ children }: { children: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="flex h-lh items-center text-kumo-subtle">
        <Info size={16} />
      </span>
      <Text variant="secondary" size="sm">
        {children}
      </Text>
    </div>
  );
}

function GeneralSection({
  site,
  onReload,
  reloading,
}: {
  site: Site | undefined;
  onReload: () => void;
  reloading: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const save = useSaveSite(site?.id ?? "");
  const [name, setName] = useState(site?.name ?? "");
  const [locale, setLocale] = useState(site?.defaultLocale ?? "");
  const [attempted, setAttempted] = useState(false);
  // When the saved values change (our save, or "Load latest" after a conflict), the form follows.
  // A domain save bumps `rev` without touching these, so it keeps unsaved edits here.
  const savedName = site?.name;
  const savedLocale = site?.defaultLocale;
  useEffect(() => {
    if (savedName !== undefined) setName(savedName);
    if (savedLocale !== undefined) setLocale(savedLocale);
  }, [savedName, savedLocale]);
  const dirty = !!site && (name.trim() !== site.name || locale !== site.defaultLocale);
  const nameError = attempted ? validateName(name) : undefined;
  const submit = () => {
    if (!site) return;
    setAttempted(true);
    if (!dirty || validateName(name)) return;
    save.mutate(applyGeneral(site, { name, defaultLocale: locale }), {
      onSuccess: (saved) => {
        setAttempted(false);
        toast.success(t("siteSettings.general.saved"), t("common.rev", { rev: saved.rev }));
      },
    });
  };
  const discard = () => {
    if (!site) return;
    setName(site.name);
    setLocale(site.defaultLocale);
    setAttempted(false);
    save.reset();
  };
  const locales = site ? Array.from(new Set([site.defaultLocale, ...site.locales])) : [];

  return (
    <SettingsSection
      id="general"
      title={t("siteSettings.sections.general")}
      description={t("siteSettings.general.description")}
      footer={
        <>
          {dirty && (
            <Button variant="ghost" onClick={discard} disabled={save.isPending}>
              {t("common.discard")}
            </Button>
          )}
          <Button variant="primary" onClick={submit} loading={save.isPending} disabled={!dirty}>
            {t("common.saveChanges")}
          </Button>
        </>
      }
    >
      {!site ? (
        <SectionSkeleton />
      ) : (
        <>
          <SaveError
            error={save.error}
            title={t("siteSettings.general.failed")}
            onReload={() => {
              save.reset();
              onReload();
            }}
            reloading={reloading}
          />
          <Input
            className="w-full"
            label={t("siteSettings.general.name")}
            description={t("siteSettings.general.nameHint")}
            value={name}
            onValueChange={setName}
            maxLength={NAME_MAX + 50}
            error={
              nameError
                ? t(`siteSettings.general.errors.${nameError}`, { max: NAME_MAX })
                : undefined
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="@container">
            <div className="grid items-start gap-5 @lg:grid-cols-2">
              <InputGroup
                label={t("siteSettings.general.slug")}
                description={t("siteSettings.general.slugHint")}
              >
                <InputGroup.Addon>/</InputGroup.Addon>
                <InputGroup.Input value={site.slug} readOnly className="text-kumo-subtle" />
              </InputGroup>
              <Select
                label={t("siteSettings.general.defaultLocale")}
                description={t("siteSettings.general.defaultLocaleHint")}
                value={locale}
                onValueChange={(v) => setLocale(String(v))}
                items={Object.fromEntries(locales.map((l) => [l, l]))}
              />
            </div>
          </div>
          <dl className="-mb-3 divide-y divide-kumo-hairline border-kumo-hairline border-t">
            <SettingRow
              label={t("siteSettings.general.locales")}
              hint={t("siteSettings.general.localesHint")}
            >
              {site.locales.map((l) => (
                <Badge key={l} variant="outline">
                  <span className="font-mono text-[0.9em]">{l}</span>
                </Badge>
              ))}
            </SettingRow>
            <SettingRow label={t("siteSettings.general.siteId")}>
              <InlineCopyText>{site.id}</InlineCopyText>
            </SettingRow>
          </dl>
        </>
      )}
    </SettingsSection>
  );
}

function DomainMenu({
  domain,
  onMakePrimary,
  onRemove,
}: {
  domain: Domain;
  onMakePrimary: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button
            variant="ghost"
            size="xs"
            shape="square"
            icon={<DotsThree weight="bold" />}
            aria-label={t("site.rowMenu")}
          />
        }
      />
      <DropdownMenu.Content align="end">
        <DropdownMenu.Item
          icon={ArrowSquareOut}
          onClick={() => window.open(`https://${domain.hostname}`, "_blank", "noopener")}
        >
          {t("siteSettings.domains.visit")}
        </DropdownMenu.Item>
        {!domain.primary && (
          <DropdownMenu.Item icon={Star} onClick={onMakePrimary}>
            {t("siteSettings.domains.makePrimary")}
          </DropdownMenu.Item>
        )}
        <DropdownMenu.Item icon={Trash} variant="danger" onClick={onRemove}>
          {t("siteSettings.domains.remove")}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}

function DomainsSection({
  site,
  onReload,
  reloading,
}: {
  site: Site | undefined;
  onReload: () => void;
  reloading: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const save = useSaveSite(site?.id ?? "");
  const [input, setInput] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [toRemove, setToRemove] = useState<Domain | undefined>();
  const domains = site?.domains ?? [];
  const hostname = normalizeHostname(input);
  const error = attempted ? validateHostname(hostname, domains) : undefined;

  const write = (next: Domain[], done: () => void) => {
    if (!site) return;
    save.mutate({ ...site, domains: next }, { onSuccess: done });
  };
  const add = () => {
    setAttempted(true);
    if (validateHostname(hostname, domains) || save.isPending) return;
    const willBePrimary = !domains.some((d) => d.primary);
    write(addDomain(domains, hostname), () => {
      setInput("");
      setAttempted(false);
      toast.success(
        t("siteSettings.domains.added"),
        willBePrimary
          ? t("siteSettings.domains.addedPrimaryDescription", { hostname })
          : t("siteSettings.domains.addedDescription", { hostname }),
      );
    });
  };
  const nextPrimary = toRemove?.primary
    ? primaryHostname(removeDomain(domains, toRemove.hostname))
    : undefined;

  return (
    <SettingsSection
      id="domains"
      title={t("siteSettings.sections.domains")}
      description={t("siteSettings.domains.description")}
      aside={
        site && (
          <Badge variant="secondary">
            <span className="tabular-nums">{domains.length}</span>
          </Badge>
        )
      }
      flush
    >
      {!site ? (
        <div className="px-5 py-4">
          <SectionSkeleton />
        </div>
      ) : (
        <>
          {save.error && !toRemove && (
            <div className="px-5 pt-4">
              <SaveError
                error={save.error}
                title={t("siteSettings.domains.failed")}
                onReload={() => {
                  save.reset();
                  onReload();
                }}
                reloading={reloading}
              />
            </div>
          )}
          {domains.length === 0 ? (
            <SectionEmpty
              icon={<Globe size={48} className="text-kumo-inactive" />}
              title={t("siteSettings.domains.empty")}
              description={t("siteSettings.domains.emptyDescription")}
            />
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>{t("siteSettings.domains.columns.hostname")}</Table.Head>
                  <Table.Head>{t("siteSettings.domains.columns.role")}</Table.Head>
                  <Table.Head sticky="right" />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {sortDomains(domains).map((d) => (
                  <Table.Row key={d.hostname} data-hostname={d.hostname}>
                    <Table.Cell className="whitespace-nowrap">
                      <Text variant="mono" as="span">
                        {d.hostname}
                      </Text>
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap">
                      {d.primary ? (
                        <Badge variant="info" icon={<Star weight="fill" />}>
                          {t("siteSettings.domains.primary")}
                        </Badge>
                      ) : (
                        <Badge variant="outline">{t("siteSettings.domains.alias")}</Badge>
                      )}
                    </Table.Cell>
                    <Table.Cell sticky="right" className="text-right">
                      <DomainMenu
                        domain={d}
                        onMakePrimary={() =>
                          write(makePrimary(domains, d.hostname), () =>
                            toast.success(
                              t("siteSettings.domains.primaryChanged"),
                              t("siteSettings.domains.primaryChangedDescription", {
                                hostname: d.hostname,
                              }),
                            ),
                          )
                        }
                        onRemove={() => {
                          save.reset();
                          setToRemove(d);
                        }}
                      />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
          <div className="grid grid-cols-1 gap-3 border-kumo-hairline border-t px-5 pt-4 pb-5">
            {/* Kumo's hybrid InputGroup: the button is attached to the field, so it lines up
                with the input whatever the label, description or error do. */}
            <InputGroup
              label={t("siteSettings.domains.hostname")}
              error={
                error
                  ? {
                      message: t(`siteSettings.domains.errors.${error}`),
                      match: true,
                    }
                  : undefined
              }
            >
              <InputGroup.Addon>https://</InputGroup.Addon>
              <InputGroup.Input
                value={input}
                placeholder={t("siteSettings.domains.placeholder")}
                // w-0 + grow: no intrinsic input width, so the row fits a 375px card.
                className="w-0"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                onChange={(e) => {
                  setInput((e.target as HTMLInputElement).value);
                  setAttempted(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
              />
              <InputGroup.Button
                variant="secondary"
                icon={<Plus />}
                onClick={add}
                loading={save.isPending && !toRemove}
              >
                {t("siteSettings.domains.add")}
              </InputGroup.Button>
            </InputGroup>
            <InfoLine>{t("siteSettings.domains.dnsHint")}</InfoLine>
          </div>
        </>
      )}
      <ConfirmDialog
        open={toRemove !== undefined}
        onOpenChange={(o) => {
          if (!o) {
            setToRemove(undefined);
            save.reset();
          }
        }}
        title={t("siteSettings.domains.removeTitle", { hostname: toRemove?.hostname ?? "" })}
        description={t("siteSettings.domains.removeDescription")}
        detail={
          toRemove && domains.length === 1
            ? t("siteSettings.domains.removeLastDetail")
            : nextPrimary
              ? t("siteSettings.domains.removePrimaryDetail", { next: nextPrimary })
              : undefined
        }
        confirmLabel={t("siteSettings.domains.remove")}
        busy={save.isPending}
        error={
          save.error
            ? isConflict(save.error)
              ? t("siteSettings.conflictDescription")
              : errorMessage(save.error)
            : undefined
        }
        onConfirm={() => {
          if (!toRemove) return;
          const removed = toRemove.hostname;
          write(removeDomain(domains, removed), () => {
            setToRemove(undefined);
            toast.success(t("siteSettings.domains.removed"), removed);
          });
        }}
      />
    </SettingsSection>
  );
}

function snapshotLabel(s: Snapshot, live: boolean, locale: string, liveLabel: string): string {
  const when = absoluteTime(s.createdAt, locale);
  const name = s.label ?? s.id;
  return `${name} · ${when}${live ? ` · ${liveLabel}` : ""}`;
}

/** The minted link in an `InsetPanel`: URL (or the bare token) to copy, target, expiry. */
function PreviewResult({ link }: { link: PreviewLink }) {
  const { t, locale } = useI18n();
  const kind = link.target === "live" ? "live" : "snapshot";
  return (
    <div data-testid="preview-link" aria-live="polite">
      <InsetPanel className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Text bold as="span">
              {t("siteSettings.previews.result")}
            </Text>
            <Badge variant={kind === "live" ? "info" : "secondary"}>
              {t(`siteSettings.previews.showing.${kind}`)}
            </Badge>
          </div>
          {link.url && (
            <LinkButton href={link.url} external variant="secondary" size="sm">
              {t("siteSettings.previews.openLink")}
            </LinkButton>
          )}
        </div>
        {link.url ? (
          <ClipboardText
            size="base"
            text={link.url}
            tooltip={{ text: t("common.copy"), copiedText: t("common.copied") }}
          />
        ) : (
          <>
            <Banner
              variant="alert"
              size="sm"
              icon={<Warning weight="fill" />}
              title={t("siteSettings.previews.noDomainTitle")}
              description={t("siteSettings.previews.noDomainDescription")}
            />
            <div className="grid gap-1.5">
              <Text size="sm" bold as="span">
                {t("siteSettings.previews.token")}
              </Text>
              <ClipboardText
                size="base"
                text={link.token}
                tooltip={{ text: t("common.copy"), copiedText: t("common.copied") }}
              />
            </div>
          </>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Tooltip content={absoluteTime(link.expiresAt, locale)}>
            <Text variant="secondary" size="sm" as="span">
              {t("siteSettings.previews.expires", {
                when: new Date(link.expiresAt).toLocaleString(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              })}
            </Text>
          </Tooltip>
          <Text variant="secondary" size="sm" as="span">
            {t("siteSettings.previews.opens", { path: link.path })}
          </Text>
        </div>
      </InsetPanel>
    </div>
  );
}

type TargetKind = "live" | "snapshot";

function PreviewLinksSection({
  site,
  enabled,
}: {
  site: Site | undefined;
  /** From `/api/instance`; undefined while loading or when the server doesn't report it. */
  enabled: boolean | undefined;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const siteId = site?.id ?? "";
  const snapshots = useQuery({
    queryKey: ["snapshots", siteId],
    queryFn: () => api.snapshots.list(siteId),
    enabled: !!site,
  });
  const [kind, setKind] = useState<TargetKind>("live");
  const [snapshotId, setSnapshotId] = useState<string | undefined>();
  const [path, setPath] = useState("");
  const [ttl, setTtl] = useState<PreviewTtl>("1d");
  const [attempted, setAttempted] = useState(false);
  const [link, setLink] = useState<PreviewLink | undefined>();
  const create = useMutation({
    mutationFn: (input: PreviewLinkInput) => api.previewLinks.create(siteId, input),
    onSuccess: (created) => {
      setLink(created);
      setAttempted(false);
      toast.success(t("siteSettings.previews.created"));
    },
  });
  const notEnabled = enabled === false || isNotEnabled(create.error);
  const parsedPath = normalizePreviewPath(path);
  const pathError = "error" in parsedPath ? t("siteSettings.previews.pathInvalid") : undefined;
  const snapshotError =
    attempted && kind === "snapshot" && !snapshotId
      ? t("siteSettings.previews.snapshotRequired")
      : undefined;
  const host = primaryHostname(site?.domains ?? []);
  const submit = () => {
    setAttempted(true);
    if ("error" in parsedPath || (kind === "snapshot" && !snapshotId) || !site) return;
    create.mutate({
      target: kind === "live" ? "live" : { snapshot: snapshotId as string },
      path: parsedPath.path,
      ttlSeconds: ttlSeconds(ttl),
    });
  };
  const snapshotItems = Object.fromEntries(
    (snapshots.data ?? []).map((s) => [
      s.id,
      snapshotLabel(s, s.id === site?.publishedSnapshotId, locale, t("siteSettings.previews.live")),
    ]),
  );

  return (
    <SettingsSection
      id="previews"
      title={t("siteSettings.sections.previews")}
      description={t("siteSettings.previews.description")}
      footer={
        notEnabled ? undefined : (
          <Button
            variant="primary"
            icon={<LinkSimple />}
            onClick={submit}
            loading={create.isPending}
            disabled={!site}
          >
            {t("siteSettings.previews.create")}
          </Button>
        )
      }
    >
      {!site ? (
        <SectionSkeleton />
      ) : notEnabled ? (
        <Banner
          variant="secondary"
          icon={<Info weight="fill" />}
          title={t("siteSettings.previews.notEnabledTitle")}
          description={t("siteSettings.previews.notEnabledDescription")}
        />
      ) : (
        <>
          {create.error && (
            <Banner
              variant="error"
              size="sm"
              icon={<WarningCircle weight="fill" />}
              title={t("siteSettings.previews.failed")}
              description={errorMessage(create.error)}
            />
          )}
          <Radio.Group
            legend={t("siteSettings.previews.target")}
            appearance="card"
            orientation="horizontal"
            value={kind}
            onValueChange={(v) => setKind(v as TargetKind)}
          >
            {(["live", "snapshot"] as const).map((k) => (
              <Radio.Item
                key={k}
                value={k}
                label={t(`siteSettings.previews.targets.${k}`)}
                description={t(`siteSettings.previews.targetHints.${k}`)}
              />
            ))}
          </Radio.Group>
          {kind === "snapshot" && (
            <Select
              label={t("siteSettings.previews.snapshot")}
              placeholder={t("siteSettings.previews.snapshotPlaceholder")}
              value={snapshotId ?? null}
              onValueChange={(v) => setSnapshotId(v ? String(v) : undefined)}
              items={snapshotItems}
              loading={snapshots.isPending}
              disabled={snapshots.data?.length === 0}
              description={
                snapshots.data?.length === 0 ? t("siteSettings.previews.noSnapshots") : undefined
              }
              error={snapshotError}
            />
          )}
          <div className="@container">
            <div className="grid items-start gap-5 @lg:grid-cols-[2fr_1fr]">
              <InputGroup
                label={t("siteSettings.previews.path")}
                description={t("siteSettings.previews.pathHint")}
                error={pathError ? { message: pathError, match: true } : undefined}
              >
                <InputGroup.Addon>{host ? `${host}/` : "/"}</InputGroup.Addon>
                <InputGroup.Input
                  value={path}
                  placeholder={t("siteSettings.previews.pathPlaceholder")}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={pathError ? true : undefined}
                  onChange={(e) => setPath((e.target as HTMLInputElement).value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submit();
                    }
                  }}
                />
              </InputGroup>
              <Select
                label={t("siteSettings.previews.ttl")}
                value={ttl}
                onValueChange={(v) => setTtl(v as PreviewTtl)}
                items={Object.fromEntries(
                  PREVIEW_TTLS.map((o) => [o.id, t(`siteSettings.previews.ttls.${o.id}`)]),
                )}
              />
            </div>
          </div>
          {link && <PreviewResult link={link} />}
          <InfoLine>{t("siteSettings.previews.revokeHint")}</InfoLine>
        </>
      )}
    </SettingsSection>
  );
}

/** Site › Settings (DESIGN.md §2c settings template, §2k). */
export function SiteSettingsPage() {
  const t = useT();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const instance = useQuery({ queryKey: ["instance"], queryFn: api.instance });
  const reload = () => void site.refetch();
  // The Site node carries domains: Administrators change it (RFC-0005 §1); everyone reads it and
  // may still create preview links (`preview:create`).
  const settings = useGate("settings.write");
  return (
    <PageLayout
      crumbs={<SiteCrumbs siteId={siteId} trail={[{ label: t("pageHeaders.settings.title") }]} />}
      title={t("pageHeaders.settings.title")}
      description={t("pageHeaders.settings.description")}
    >
      <ErrorBanner error={site.error} onRetry={reload} retrying={site.isFetching} />
      <ViewOnlyBanner reason={settings.reason} />
      <SettingsLayout
        title={t("common.onThisPage")}
        sections={SECTIONS.map((id) => ({ id, label: t(`siteSettings.sections.${id}`) }))}
      >
        <ReadOnly reason={settings.reason} className="grid min-w-0 content-start gap-6">
          <GeneralSection site={site.data} onReload={reload} reloading={site.isFetching} />
          <DomainsSection site={site.data} onReload={reload} reloading={site.isFetching} />
        </ReadOnly>
        <PreviewLinksSection site={site.data} enabled={instance.data?.features.previewLinks} />
      </SettingsLayout>
    </PageLayout>
  );
}
