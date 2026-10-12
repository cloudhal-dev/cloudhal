import type { Taxonomy, Term } from "@cloudhal/core-contracts";
import {
  Badge,
  Banner,
  Checkbox,
  Field,
  InputGroup,
  InsetPanel,
  LayerDialog,
  SkeletonLine,
  Text,
} from "@cloudhal/ui";
import {
  ArrowRight,
  Camera,
  Globe,
  Prohibit,
  WarningCircle,
  WarningOctagon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { type MessageKey, useT } from "../i18n/index.tsx";
import {
  ApiRequestError,
  api,
  type GovernanceOp,
  type GovernancePreview,
  type GovernanceResponse,
} from "../lib/api.ts";
import {
  archivePath,
  descendantIds,
  parentCandidates,
  type SlugError,
  slugify,
  TERM_LIMITS,
  validateSlug,
} from "../lib/taxonomy.ts";
import { ErrorBanner } from "./ErrorBanner.tsx";
import { Status } from "./Status.tsx";
import { invalidateTaxonomy, type TaxonomyData } from "./Taxonomy.tsx";
import { TermCombobox, treeOptions } from "./TermPickers.tsx";
import { useToast } from "./Toast.ts";
import { useSettled } from "./useSettled.ts";

/**
 * The governance operations a person runs on a term (RFC-0002 §4.3, §8). Each is one batch and
 * one snapshot; the dialog previews the affected articles and the redirects first.
 */
export type GovernanceKind =
  | "rename"
  | "merge"
  | "retire"
  | "move"
  | "visibility"
  | "reject"
  | "reviewMerge";

export interface GovernanceTarget {
  kind: GovernanceKind;
  term: Term;
  /** Prefilled merge target (the hygiene panel's suggestion). */
  into?: string | undefined;
}

const SLUG_ERROR: Record<SlugError, MessageKey> = {
  required: "governance.rename.errors.required",
  invalid: "governance.rename.errors.invalid",
  tooLong: "governance.rename.errors.tooLong",
  taken: "governance.rename.errors.taken",
  reserved: "governance.rename.errors.reserved",
};

/** "This would change 523 articles…" from a 409 `too_large` (or the preview's numbers). */
function tooLargeOf(error: unknown): { entries: number; limit: number } | undefined {
  if (!(error instanceof ApiRequestError) || error.body.error !== "too_large") return undefined;
  const d = (error.body.details ?? {}) as { entries?: number; limit?: number };
  return { entries: d.entries ?? 0, limit: d.limit ?? TERM_LIMITS.governanceEntries };
}

/**
 * One dialog for rename, merge, retire, move, visibility and the review decisions (DESIGN.md §2p):
 * the choice, a live preview of the affected articles and redirects, the 400-article limit, the
 * 410/404 consequences, and "one change, one snapshot; live with the next publish". Always
 * rendered; `target` opens it.
 */
export function GovernanceDialog({
  target: current,
  tax,
  data,
  onOpenChange,
  onDone,
}: {
  target: GovernanceTarget | undefined;
  tax: Taxonomy | undefined;
  data: TaxonomyData;
  onOpenChange: (open: boolean) => void;
  onDone?: (response: GovernanceResponse, target: GovernanceTarget) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const open = current !== undefined;
  // Keep the last target on screen while the dialog animates closed.
  const last = useRef(current);
  if (current) last.current = current;
  const target = current ?? last.current;
  const term = target?.term;
  const siteId = term?.siteId ?? "";

  const [slug, setSlug] = useState("");
  const [reclaim, setReclaim] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  useEffect(() => {
    if (!current) return;
    setSlug(current.term.slug);
    setReclaim(false);
    setChoice(current.kind === "move" ? (current.term.parentId ?? null) : (current.into ?? null));
  }, [current]);

  const kind = target?.kind ?? "rename";
  const siblings = tax ? data.itemsOf(tax) : [];
  const siblingTerms = siblings.map((i) => i.term);
  const name = (x: Term) => data.name(x);
  const termName = term ? name(term) : "";
  const below = term ? descendantIds(siblingTerms, term.id) : new Set<string>();
  const activeOthers = treeOptions(
    siblings,
    name,
    (x) => x.status === "active" && !x.mergedInto && !below.has(x.id),
  );
  const retireTargets = treeOptions(
    siblings,
    name,
    (x) => x.status === "active" && !x.mergedInto && x.id !== term?.id,
  );
  const parents = term
    ? treeOptions(siblings, name, (x) =>
        parentCandidates(siblingTerms, term).some((p) => p.id === x.id),
      )
    : [];

  const slugError =
    kind === "rename" && term ? validateSlug(slug, siblingTerms, term.id) : undefined;
  const settledSlug = useSettled(slug);
  const nextVisibility = term?.visibility === "public" ? "internal" : "public";
  // A slug in someone's history is free only when the person reclaims it (invariant 8).
  const renamable = (e: SlugError | undefined) => !e || (e === "reserved" && reclaim);
  const op: GovernanceOp | undefined = !term
    ? undefined
    : kind === "rename"
      ? settledSlug !== term.slug && renamable(validateSlug(settledSlug, siblingTerms, term.id))
        ? { op: "rename", slug: settledSlug, ...(reclaim ? { reclaim: true } : {}) }
        : undefined
      : kind === "merge"
        ? choice
          ? { op: "merge", into: choice }
          : undefined
        : kind === "reviewMerge"
          ? choice
            ? { op: "review", decision: "merge", into: choice }
            : undefined
          : kind === "retire"
            ? { op: "retire", ...(choice ? { redirectTo: choice } : {}) }
            : kind === "move"
              ? (term.parentId ?? null) !== choice
                ? { op: "parent", parentId: choice }
                : undefined
              : kind === "visibility"
                ? { op: "visibility", visibility: nextVisibility }
                : { op: "review", decision: "reject" };
  // A reserved slug is offered back through "reclaim" (people only); until then it can't preview.
  const blockedByReserve = kind === "rename" && slugError === "reserved" && !reclaim;
  const preview = useQuery({
    queryKey: ["governance-preview", term?.id, term?.rev, op],
    queryFn: () => api.terms.preview(term as Term, op as GovernanceOp),
    enabled: open && op !== undefined && !blockedByReserve,
    staleTime: 0,
  });
  const run = useMutation({
    mutationFn: () => api.terms.govern(term as Term, op as GovernanceOp),
    onSuccess: async (response) => {
      await invalidateTaxonomy(qc, siteId);
      toast.success(
        t(`governance.done.${kind}`, { name: termName }),
        response.result.entries > 0 || response.result.redirects.length > 0
          ? t("governance.done.detail", {
              entries: response.result.entries,
              redirects: response.result.redirects.length,
            })
          : t("governance.oneSnapshot"),
      );
      if (target) onDone?.(response, target);
      onOpenChange(false);
    },
  });
  useEffect(() => {
    if (open) run.reset();
  }, [open, target?.kind, term?.id]);

  const p: GovernancePreview | undefined = preview.data;
  const tooLarge = p?.tooLarge ?? tooLargeOf(run.error);
  const blocked = p?.blocked;
  const ready = op !== undefined && !blockedByReserve && p !== undefined && !preview.isFetching;
  const destructive = kind === "retire" || kind === "reject";
  const runError =
    run.error && !tooLargeOf(run.error)
      ? run.error instanceof ApiRequestError && run.error.status === 409
        ? new Error(t("governance.conflict"))
        : run.error
      : undefined;

  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange} dismissDisabled={run.isPending}>
      <LayerDialog.Content size="lg" closeLabel={t("common.close")}>
        <LayerDialog.Title>
          {kind === "visibility"
            ? t(`governance.visibility.title.${nextVisibility}`, { name: termName })
            : t(`governance.${kind}.title`, { name: termName })}
        </LayerDialog.Title>
        <LayerDialog.Description>
          {kind === "visibility"
            ? t(`governance.visibility.description.${nextVisibility}`)
            : t(`governance.${kind}.description`)}
        </LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-5" data-testid="governance-dialog" data-kind={kind}>
            {kind === "rename" && tax && term && (
              <div className="grid gap-3">
                <Field
                  label={t("governance.rename.slug")}
                  description={t("governance.rename.slugHint")}
                  error={
                    slugError && slug !== term.slug && !(slugError === "reserved" && reclaim)
                      ? { message: t(SLUG_ERROR[slugError]), match: true }
                      : undefined
                  }
                >
                  <InputGroup className="w-full">
                    <InputGroup.Addon>{tax.archive.basePath}/</InputGroup.Addon>
                    <InputGroup.Input
                      aria-label={t("governance.rename.slug")}
                      value={slug}
                      onChange={(e) =>
                        setSlug(
                          slugify((e.target as HTMLInputElement).value) ||
                            (e.target as HTMLInputElement).value.toLowerCase(),
                        )
                      }
                      spellCheck={false}
                      className="font-mono"
                      data-testid="rename-slug"
                    />
                  </InputGroup>
                </Field>
                {slugError === "reserved" && slug !== term.slug && (
                  <Checkbox
                    label={t("governance.rename.reclaim")}
                    checked={reclaim}
                    onCheckedChange={(v: boolean) => setReclaim(v)}
                  />
                )}
                {(term.slugHistory?.length ?? 0) > 0 && (
                  <Text variant="secondary" size="sm">
                    {t("governance.rename.history", {
                      slugs: (term.slugHistory ?? []).join(", "),
                    })}
                  </Text>
                )}
              </div>
            )}
            {(kind === "merge" || kind === "reviewMerge") && (
              <TermCombobox
                label={t("governance.merge.target")}
                description={t("governance.merge.targetHint")}
                options={activeOthers.filter((o) => o.id !== term?.id)}
                value={choice}
                onChange={setChoice}
                name={name}
                placeholder={t("governance.merge.targetPlaceholder")}
                testId="merge-target"
              />
            )}
            {kind === "retire" && (
              <TermCombobox
                label={t("governance.retire.redirectTo")}
                description={
                  tax?.hierarchical && term?.parentId
                    ? t("governance.retire.redirectToParentHint")
                    : t("governance.retire.redirectToHint")
                }
                options={retireTargets}
                value={choice}
                onChange={setChoice}
                name={name}
                none={t("governance.retire.noRedirect")}
                placeholder={t("governance.retire.redirectPlaceholder")}
                testId="retire-target"
              />
            )}
            {kind === "move" && (
              <TermCombobox
                label={t("governance.move.parent")}
                description={t("governance.move.parentHint", { max: TERM_LIMITS.depthMax })}
                options={parents}
                value={choice}
                onChange={setChoice}
                name={name}
                none={t("governance.move.topLevel")}
                placeholder={t("governance.move.parentPlaceholder")}
                testId="move-parent"
              />
            )}
            <PreviewSection
              loading={op !== undefined && !blockedByReserve && preview.isPending}
              waiting={op === undefined}
              error={preview.error}
              preview={p}
              tooLarge={tooLarge}
              kind={kind}
              path={tax && term ? archivePath(tax, term.slug) : ""}
            />
            {blocked && (
              <Banner
                variant="error"
                icon={<Prohibit weight="fill" />}
                title={t("governance.blocked.title", { count: blocked.count })}
                description={t("governance.blocked.description")}
                data-testid="governance-blocked"
              />
            )}
            <ErrorBanner error={runError} />
            <div className="flex items-start gap-2" data-testid="one-snapshot">
              <span className="flex h-lh items-center text-kumo-subtle">
                <Camera size={16} />
              </span>
              <Text variant="secondary" size="sm" as="span">
                {t("governance.oneSnapshot")}
              </Text>
            </div>
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            variant={destructive ? "destructive" : "primary"}
            loading={run.isPending}
            disabled={!ready || Boolean(tooLarge) || Boolean(blocked)}
            onClick={() => run.mutate()}
            data-testid="governance-confirm"
          >
            {kind === "visibility"
              ? t(`governance.visibility.confirm.${nextVisibility}`)
              : t(`governance.${kind}.confirm`)}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

/** Affected articles and redirects of a previewed operation, with the limits and consequences. */
function PreviewSection({
  loading,
  waiting,
  error,
  preview: p,
  tooLarge,
  kind,
  path,
}: {
  loading: boolean;
  waiting: boolean;
  error: unknown;
  preview: GovernancePreview | undefined;
  tooLarge: { entries: number; limit: number } | undefined;
  kind: GovernanceKind;
  path: string;
}) {
  const t = useT();
  if (waiting)
    return (
      <InsetPanel>
        <Text variant="secondary" size="sm">
          {t("governance.preview.waiting")}
        </Text>
      </InsetPanel>
    );
  if (error) return <ErrorBanner error={error} />;
  if (loading || !p)
    return (
      <InsetPanel className="gap-3" label={t("governance.preview.loading")}>
        <SkeletonLine />
        <SkeletonLine />
      </InsetPanel>
    );
  const shown = p.entries.items.slice(0, 5);
  const more = p.entries.count - shown.length;
  return (
    <div className="grid gap-4" data-testid="governance-preview">
      {tooLarge && (
        <Banner
          variant="error"
          icon={<WarningOctagon weight="fill" />}
          title={t("governance.tooLarge.title")}
          description={t("governance.tooLarge.description", {
            count: tooLarge.entries,
            limit: tooLarge.limit,
          })}
          data-testid="too-large"
        />
      )}
      <section className="grid gap-2" aria-label={t("governance.preview.articles")}>
        <div className="flex items-center gap-2">
          <Text bold as="span">
            {t("governance.preview.articles")}
          </Text>
          <Badge variant="secondary">{p.entries.count}</Badge>
        </div>
        <Text variant="secondary" size="sm">
          {p.entries.count === 0
            ? t("governance.preview.noArticles")
            : p.entries.rewritten
              ? t(
                  kind === "retire" || kind === "reject"
                    ? "governance.preview.articlesLose"
                    : "governance.preview.articlesMove",
                  { limit: TERM_LIMITS.governanceEntries },
                )
              : t("governance.preview.articlesKeep")}
        </Text>
        {shown.length > 0 && (
          <InsetPanel>
            <div className="grid divide-y divide-kumo-hairline">
              {shown.map((e) => (
                <div
                  key={e.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0"
                  data-entry-id={e.id}
                >
                  <span className="grid min-w-0 gap-0.5">
                    <Text as="span" truncate>
                      {e.title || t("articles.untitled")}
                    </Text>
                    <Text variant="mono-secondary" as="span" truncate>
                      /{e.collection}/{e.slug}
                    </Text>
                  </span>
                  <Status status={e.status} />
                </div>
              ))}
              {more > 0 && (
                <div className="pt-2">
                  <Text variant="secondary" size="sm" as="span">
                    {t("governance.preview.more", { count: more })}
                  </Text>
                </div>
              )}
            </div>
          </InsetPanel>
        )}
      </section>
      <section className="grid gap-2" aria-label={t("governance.preview.redirects")}>
        <div className="flex items-center gap-2">
          <Text bold as="span">
            {t("governance.preview.redirects")}
          </Text>
          <Badge variant="secondary">{p.redirects.length}</Badge>
        </div>
        {p.redirects.length === 0 ? (
          <Text variant="secondary" size="sm">
            {t("governance.preview.noRedirects")}
          </Text>
        ) : (
          <InsetPanel className="gap-2">
            {p.redirects.map((r) => (
              <div
                key={r.from}
                className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
                data-redirect-from={r.from}
              >
                <Text variant="mono" as="span">
                  {r.from}
                </Text>
                <ArrowRight size={14} className="shrink-0 text-kumo-subtle" aria-hidden />
                <Text variant="mono" as="span">
                  {r.to}
                </Text>
                <Badge variant="outline">{t("governance.preview.permanent")}</Badge>
              </div>
            ))}
            <Text variant="secondary" size="sm">
              {t("governance.preview.prefix")}
            </Text>
          </InsetPanel>
        )}
        {p.repointed > 0 && (
          <Text variant="secondary" size="sm">
            {t("governance.preview.repointed", { count: p.repointed })}
          </Text>
        )}
      </section>
      {p.archiveGone === "gone" && (
        <Banner
          variant="alert"
          icon={<WarningCircle weight="fill" />}
          title={t("governance.gone.title")}
          description={t("governance.gone.description", { path })}
          data-testid="gone-410"
        />
      )}
      {p.archiveGone === "not_found" && (
        <Banner
          variant="alert"
          icon={<WarningCircle weight="fill" />}
          title={t("governance.hidden.title")}
          description={t("governance.hidden.description", { path })}
        />
      )}
      {p.archiveAppears && (
        <Banner
          icon={<Globe weight="fill" />}
          title={t("governance.appears.title")}
          description={t("governance.appears.description", { path: p.archiveAppears })}
        />
      )}
    </div>
  );
}
