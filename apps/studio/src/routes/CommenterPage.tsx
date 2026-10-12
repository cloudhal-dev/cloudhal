import {
  Banner,
  Button,
  Checkbox,
  CommenterSummary,
  CommentRow,
  InputArea,
  InsetPanel,
  LayerDialog,
  PageLayout,
  Radio,
  SectionCard,
  SectionEmpty,
  Select,
  Text,
} from "@cloudhal/ui";
import {
  ChatsCircle,
  DownloadSimple,
  Eraser,
  Info,
  Prohibit,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CommentMenu,
  type CommentMenuAction,
  reasonWords,
  rowData,
  useCommentWords,
} from "../components/Comments.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { EditorLayout } from "../components/EditorLayout.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ViewOnlyBanner } from "../components/Gating.tsx";
import { useToast } from "../components/Toast.ts";
import { useGate, useMe } from "../components/useMe.ts";
import {
  ApiRequestError,
  api,
  type CommentReasonCode,
  type CommentView,
  errorCode,
  isNotEnabled,
} from "../lib/api.ts";
import {
  activeBan,
  BAN_DURATIONS,
  type BanDuration,
  banUntil,
  commenterKey,
  commentsKey,
} from "../lib/comments.ts";

/** Saves a JSON document as a file (the export answers JSON, the browser downloads it). */
function download(filename: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Ban… (RFC-0007 §14): how long, by email and/or network, the reason and a note, and whether to
 * hide their approved comments too. The ban is a keyed hash; nobody sees an address.
 */
function BanDialog({
  open,
  onOpenChange,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  error?: string | undefined;
  onConfirm: (input: {
    until: string | null;
    subjects: ("email" | "ip")[];
    reasonCode: CommentReasonCode;
    note?: string;
    hidePast: boolean;
  }) => void;
}) {
  const { t } = useCommentWords();
  const [duration, setDuration] = useState<BanDuration>("30");
  const [email, setEmail] = useState(true);
  const [ip, setIp] = useState(false);
  const [reason, setReason] = useState<CommentReasonCode>("abuse");
  const [note, setNote] = useState("");
  const [hidePast, setHidePast] = useState(false);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (!open) return;
    setDuration("30");
    setEmail(true);
    setIp(false);
    setReason("abuse");
    setNote("");
    setHidePast(false);
    setTried(false);
  }, [open]);
  const d = "comments.commenter.banDialog" as const;
  const none = !email && !ip;
  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange} dismissDisabled={busy}>
      <LayerDialog.Content size="base" closeLabel={t("common.close")}>
        <LayerDialog.Title>{t(`${d}.title`)}</LayerDialog.Title>
        <LayerDialog.Description>{t(`${d}.description`)}</LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-4" data-testid="ban-dialog">
            <div className="@container">
              <div className="grid items-start gap-4 @md:grid-cols-2">
                <Select
                  label={t(`${d}.duration`)}
                  value={duration}
                  onValueChange={(v) => setDuration((v ?? "30") as BanDuration)}
                  items={Object.fromEntries(
                    BAN_DURATIONS.map((x) => [x, t(`${d}.durations.${x}`)]),
                  )}
                  className="w-full"
                  data-testid="ban-duration"
                />
                <Select
                  label={t(`${d}.reason`)}
                  value={reason}
                  onValueChange={(v) => setReason((v ?? "abuse") as CommentReasonCode)}
                  items={reasonWords(t)}
                  className="w-full"
                />
              </div>
            </div>
            <fieldset className="m-0 grid gap-2 p-0" data-testid="ban-subjects">
              <Text bold as="span">
                {t(`${d}.subjects`)}
              </Text>
              <div className="grid gap-0.5">
                <Checkbox
                  label={t(`${d}.subjectEmail`)}
                  checked={email}
                  onCheckedChange={(v: boolean) => setEmail(v)}
                />
                <Text variant="secondary" size="sm">
                  {t(`${d}.subjectEmailHint`)}
                </Text>
              </div>
              <div className="grid gap-0.5">
                <Checkbox
                  label={t(`${d}.subjectIp`)}
                  checked={ip}
                  onCheckedChange={(v: boolean) => setIp(v)}
                />
                <Text variant="secondary" size="sm">
                  {t(`${d}.subjectIpHint`)}
                </Text>
              </div>
              {tried && none && (
                <Text variant="error" size="sm">
                  {t(`${d}.subjectsRequired`)}
                </Text>
              )}
            </fieldset>
            <InputArea
              label={t(`${d}.note`)}
              description={t(`${d}.noteHint`)}
              value={note}
              onValueChange={setNote}
              maxLength={500}
              autoResize
              minRows={2}
              maxRows={4}
              className="w-full"
            />
            <div className="grid gap-0.5">
              <Checkbox
                label={t(`${d}.hidePast`)}
                checked={hidePast}
                onCheckedChange={(v: boolean) => setHidePast(v)}
              />
              <Text variant="secondary" size="sm">
                {t(`${d}.hidePastHint`)}
              </Text>
            </div>
            {error && (
              <Banner
                variant="error"
                size="sm"
                icon={<WarningCircle weight="fill" />}
                title={t("comments.commenter.banFailed")}
                description={error}
              />
            )}
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            variant="destructive"
            loading={busy}
            onClick={() => {
              setTried(true);
              if (none) return;
              onConfirm({
                until: banUntil(duration),
                subjects: [
                  ...(email ? (["email"] as const) : []),
                  ...(ip ? (["ip"] as const) : []),
                ],
                reasonCode: reason,
                ...(note.trim() ? { note: note.trim() } : {}),
                hidePast,
              });
            }}
            data-testid="ban-confirm"
          >
            {t(`${d}.confirm`)}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

/**
 * Erase… (RFC-0007 §9.4, GDPR Art. 17): anonymise (default) or also delete the text, a required
 * reason, and what happens spelled out before the destructive "Erase". Audited on the server.
 */
function EraseDialog({
  open,
  onOpenChange,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  error?: string | undefined;
  onConfirm: (input: { mode: "anonymise" | "delete-text"; reason: string }) => void;
}) {
  const { t } = useCommentWords();
  const [mode, setMode] = useState<"anonymise" | "delete-text">("anonymise");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (!open) return;
    setMode("anonymise");
    setReason("");
    setTried(false);
  }, [open]);
  const d = "comments.commenter.eraseDialog" as const;
  const missing = reason.trim() === "";
  const points: ("name" | "email" | "text" | "live" | "audit")[] = [
    "name",
    "email",
    ...(mode === "delete-text" ? (["text"] as const) : []),
    "live",
    "audit",
  ];
  return (
    <LayerDialog.Alert open={open} onOpenChange={onOpenChange} dismissDisabled={busy}>
      <LayerDialog.Content size="base" closeLabel={t("common.close")}>
        <LayerDialog.Title>{t(`${d}.title`)}</LayerDialog.Title>
        <LayerDialog.Description>{t(`${d}.description`)}</LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-4" data-testid="erase-dialog">
            <Radio.Group
              appearance="card"
              legend={t(`${d}.title`)}
              value={mode}
              onValueChange={(v) => setMode(v === "delete-text" ? "delete-text" : "anonymise")}
            >
              <Radio.Item
                value="anonymise"
                label={t(`${d}.anonymise`)}
                description={t(`${d}.anonymiseHint`)}
              />
              <Radio.Item
                value="delete-text"
                label={t(`${d}.deleteText`)}
                description={t(`${d}.deleteTextHint`)}
              />
            </Radio.Group>
            <InsetPanel label={t(`${d}.consequences`)}>
              <Text as="span" bold>
                {t(`${d}.consequences`)}
              </Text>
              <div className="grid gap-1.5" data-testid="erase-points">
                {points.map((k) => (
                  <Text key={k} as="span" variant="secondary" size="sm">
                    {t(`${d}.points.${k}`)}
                  </Text>
                ))}
              </div>
            </InsetPanel>
            <InputArea
              label={t(`${d}.reason`)}
              description={t(`${d}.reasonHint`)}
              value={reason}
              onValueChange={setReason}
              error={tried && missing ? t(`${d}.reasonRequired`) : undefined}
              maxLength={500}
              autoResize
              minRows={2}
              maxRows={5}
              className="w-full"
              data-testid="erase-reason"
            />
            {error && (
              <Banner
                variant="error"
                size="sm"
                icon={<WarningCircle weight="fill" />}
                title={t("comments.commenter.eraseFailed")}
                description={error}
              />
            )}
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            variant="destructive"
            loading={busy}
            onClick={() => {
              setTried(true);
              if (!missing) onConfirm({ mode, reason: reason.trim() });
            }}
            data-testid="erase-confirm"
          >
            {t(`${d}.confirm`)}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Alert>
  );
}

/**
 * Site › Comments › a commenter (RFC-0007 §9.4, §14; DESIGN.md §2w), `commenters:data` only —
 * others see why, and no data: the identity (`CommenterSummary`, the email only here), their
 * comments, and Ban…, Export their data, Erase….
 */
export function CommenterPage() {
  const { t, locale, words } = useCommentWords();
  const { siteId, commenterId } = useParams({ from: "/sites/$siteId/commenters/$commenterId" });
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  // Gating is cosmetic, but commenter data is not even asked for before the role is known.
  const known = !useMe().isPending;
  const data = useGate("commenters.data");
  const banGate = useGate("comments.moderateAny");
  const [banOpen, setBanOpen] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);
  const who = useQuery({
    queryKey: commenterKey(siteId, commenterId),
    queryFn: () => api.comments.commenter(siteId, commenterId),
    enabled: known && data.allowed,
    retry: (count, error) => !isNotEnabled(error) && count < 1,
  });
  const comments: CommentView[] = [...(who.data?.comments ?? [])].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const latest = comments[0];
  const bans = useQuery({
    queryKey: [...commenterKey(siteId, commenterId), "bans", latest?.id ?? ""],
    queryFn: () => api.comments.bans(siteId, latest?.id),
    enabled: known && data.allowed && banGate.allowed && latest !== undefined,
  });
  const ban = activeBan(bans.data?.items ?? []);
  const refresh = () => qc.invalidateQueries({ queryKey: commentsKey(siteId) });

  const banMutation = useMutation({
    mutationFn: (input: Parameters<typeof api.comments.ban>[1]) => api.comments.ban(siteId, input),
    onSuccess: async (result) => {
      setBanOpen(false);
      toast.success(
        t("comments.commenter.banned"),
        result.hidden > 0
          ? t("comments.commenter.bannedHidden", { count: result.hidden })
          : undefined,
      );
      await refresh();
    },
  });
  const unban = useMutation({
    mutationFn: async () => {
      for (const b of bans.data?.items ?? []) await api.comments.liftBan(siteId, b.id);
    },
    onSuccess: async () => {
      toast.success(t("comments.commenter.unbanned"));
      await refresh();
    },
    onError: (e) => toast.error(t("comments.commenter.unbanFailed"), e.message),
  });
  const exportData = useMutation({
    mutationFn: () => api.comments.exportCommenter(siteId, commenterId),
    onSuccess: (doc) => {
      download(`commenter-${commenterId}.json`, doc);
      toast.success(t("comments.commenter.exported"));
    },
    onError: (e) => toast.error(t("comments.commenter.exportFailed"), e.message),
  });
  const erase = useMutation({
    mutationFn: (input: { mode: "anonymise" | "delete-text"; reason: string }) =>
      api.comments.eraseCommenter(siteId, commenterId, input.mode, input.reason),
    onSuccess: async (result) => {
      setEraseOpen(false);
      toast.success(
        t("comments.commenter.erased"),
        t("comments.commenter.erasedDescription", { count: result.comments }),
      );
      await refresh();
    },
  });

  const names = [
    ...new Set(comments.flatMap((c) => (c.author.kind === "erased" ? [] : [c.author.name]))),
  ];
  const counts: Partial<Record<CommentView["status"], number>> = {};
  for (const c of comments) counts[c.status] = (counts[c.status] ?? 0) + 1;
  const keysMissing =
    errorCode(who.error) === "comments_key_missing" ||
    (who.error instanceof ApiRequestError && who.error.status === 503);
  const notFound = isNotEnabled(who.error);

  const onMenu = (comment: CommentView, action: CommentMenuAction) => {
    const thread = (search: Record<string, string>) =>
      navigate({
        to: "/sites/$siteId/comments/$nodeId",
        params: { siteId, nodeId: comment.nodeId },
        search,
      });
    void thread(action === "reply" ? { reply: comment.id } : { comment: comment.id });
  };

  const summary = (
    <CommenterSummary
      locale={locale}
      words={words}
      labels={{
        names: t("comments.commenter.names"),
        email: t("comments.commenter.email"),
        firstSeen: t("comments.commenter.firstSeen"),
        lastSeen: t("comments.commenter.lastSeen"),
        ban: t("comments.commenter.ban"),
        counts: t("comments.commenter.counts"),
        notBanned: t("comments.commenter.notBanned"),
        bannedUntil: (date) => t("comments.commenter.bannedUntil", { date }),
        bannedForever: t("comments.commenter.bannedForever"),
        banSubject: {
          email: t("comments.commenter.banSubject.email"),
          ip: t("comments.commenter.banSubject.ip"),
        },
        loading: t("common.loading"),
      }}
      names={names}
      counts={counts}
      {...(who.data ? { firstSeen: who.data.commenter.firstSeen } : {})}
      {...(latest ? { lastSeen: latest.createdAt } : {})}
      ban={
        ban
          ? {
              until: ban.until,
              subjects: (bans.data?.items ?? []).map((b) => b.subject),
              reason: reasonWords(t)[ban.reasonCode],
            }
          : null
      }
      {...(who.data ? { email: who.data.commenter.email } : {})}
      canSeeEmail={data.allowed}
      loading={who.isPending}
      actions={
        <div className="flex flex-wrap items-center gap-2" data-testid="commenter-actions">
          {ban ? (
            <Button
              variant="secondary"
              icon={<Prohibit />}
              loading={unban.isPending}
              disabled={!banGate.allowed}
              title={banGate.reason}
              onClick={() => unban.mutate()}
            >
              {t("comments.commenter.actions.unban")}
            </Button>
          ) : (
            <Button
              variant="secondary"
              icon={<Prohibit />}
              disabled={!banGate.allowed || !latest}
              title={banGate.reason}
              onClick={() => {
                banMutation.reset();
                setBanOpen(true);
              }}
              data-testid="commenter-ban"
            >
              {t("comments.commenter.actions.ban")}
            </Button>
          )}
          <Button
            variant="secondary"
            icon={<DownloadSimple />}
            loading={exportData.isPending}
            onClick={() => exportData.mutate()}
            data-testid="commenter-export"
          >
            {t("comments.commenter.actions.export")}
          </Button>
          <Button
            variant="secondary-destructive"
            icon={<Eraser />}
            onClick={() => {
              erase.reset();
              setEraseOpen(true);
            }}
            data-testid="commenter-erase"
          >
            {t("comments.commenter.actions.erase")}
          </Button>
        </div>
      }
    />
  );

  return (
    <PageLayout
      crumbs={
        <SiteCrumbs
          siteId={siteId}
          trail={[
            { label: t("comments.title"), href: `/sites/${siteId}/comments` },
            { label: t("comments.commenter.title") },
          ]}
          copy={commenterId}
        />
      }
      title={names[0] ?? t("comments.commenter.title")}
      loading={who.isPending && data.allowed}
      description={t("comments.commenter.description")}
    >
      {!data.allowed ? (
        <ViewOnlyBanner reason={data.reason} />
      ) : keysMissing ? (
        <Banner
          variant="secondary"
          icon={<Info weight="fill" />}
          title={t("comments.commenter.title")}
          description={t("comments.commenter.keysMissing")}
        />
      ) : notFound ? (
        <Banner
          variant="secondary"
          icon={<Info weight="fill" />}
          title={t("comments.commenter.notFoundTitle")}
          description={t("comments.commenter.notFoundDescription")}
        />
      ) : (
        <>
          <ErrorBanner error={who.error} onRetry={() => void who.refetch()} />
          <EditorLayout
            main={
              <SectionCard
                title={t("comments.commenter.theirComments")}
                icon={<ChatsCircle size={16} />}
                description={t("comments.commenter.theirCommentsDescription")}
                flush
              >
                {who.data && comments.length === 0 ? (
                  <SectionEmpty
                    icon={<ChatsCircle size={32} className="text-kumo-inactive" />}
                    title={t("comments.commenter.noComments")}
                    description={t("comments.commenter.noCommentsDescription")}
                  />
                ) : (
                  <div className="divide-y divide-kumo-hairline" data-testid="commenter-comments">
                    {comments.map((c) => (
                      <CommentRow
                        key={c.id}
                        comment={rowData(siteId, c)}
                        words={words}
                        locale={locale}
                        actions={
                          <CommentMenu
                            comment={c}
                            onAction={(a) => onMenu(c, a)}
                            hide={[
                              "approve",
                              "restore",
                              "hide",
                              "spam",
                              "hold",
                              "delete",
                              "resolve",
                              "commenter",
                            ]}
                          />
                        }
                      />
                    ))}
                  </div>
                )}
              </SectionCard>
            }
            aside={
              <SectionCard title={t("comments.commenter.identity")} icon={<UserCircle size={16} />}>
                {summary}
              </SectionCard>
            }
          />
        </>
      )}
      <BanDialog
        open={banOpen}
        onOpenChange={setBanOpen}
        busy={banMutation.isPending}
        error={banMutation.error?.message}
        onConfirm={(input) => latest && banMutation.mutate({ commentId: latest.id, ...input })}
      />
      <EraseDialog
        open={eraseOpen}
        onOpenChange={setEraseOpen}
        busy={erase.isPending}
        error={erase.error?.message}
        onConfirm={(input) => erase.mutate(input)}
      />
    </PageLayout>
  );
}
