/**
 * Studio's Build chat (RFC-0020 §6, phase 20c): a person describes the page; the site's model
 * changes the draft step by step while the Build view's preview and activity follow along. The
 * transcript is this browser's only: the draft and its snapshot are what last.
 */
import {
  Banner,
  type BuildChatItem,
  BuildChatLog,
  Button,
  InputArea,
  LinkButton,
  SectionCard,
  SectionEmpty,
  SkeletonLine,
} from "@cloudhal/ui";
import { GearSix, Sparkle, StopCircle, WarningCircle } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useT } from "../i18n/index.tsx";
import { api, errorCode } from "../lib/api.ts";

const ERRORS = new Set([
  "ai_budget",
  "ai_busy",
  "ai_off",
  "ai_model_unavailable",
  "ai_rate_limited",
  "ai_unavailable",
  "ai_failed",
]);

export function BuildChat({ siteId, pageId }: { siteId: string; pageId: string }) {
  const t = useT("build");
  const settings = useQuery({
    queryKey: ["ai-settings", siteId],
    queryFn: () => api.ai.settings(siteId),
  });
  const [items, setItems] = useState<BuildChatItem[]>([]);
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const seq = useRef(0);
  const nextId = () => `${Date.now()}-${++seq.current}`;
  const errorText = (code: string | undefined) =>
    t(
      `build.chat.errors.${code && ERRORS.has(code) ? code : "ai_failed"}` as "build.chat.errors.ai_failed",
    );

  /** Replaces the live progress line (there is at most one, at the end). */
  const progress = (text: string | undefined) =>
    setItems((list) => {
      const rest = list.filter((i) => i.role !== "progress");
      return text ? [...rest, { id: "progress", role: "progress", text }] : rest;
    });
  const add = (item: Omit<BuildChatItem, "id">) =>
    setItems((list) => [...list.filter((i) => i.role !== "progress"), { id: nextId(), ...item }]);

  const send = async () => {
    const brief = message.trim();
    if (!brief || running) return;
    setMessage("");
    setRunning(true);
    add({ role: "person", text: brief });
    progress(t("build.chat.thinking"));
    const controller = new AbortController();
    abort.current = controller;
    const repairs: string[] = [];
    try {
      for await (const e of api.ai.build(siteId, pageId, brief, controller.signal)) {
        if (e.type === "say") {
          add({ role: "model", text: e.text });
          progress(t("build.chat.thinking"));
        } else if (e.type === "writing")
          progress(t("build.chat.writing", { components: e.components.join(", ") }));
        else if (e.type === "round" && e.round > 1) progress(t("build.chat.fixing"));
        else if (e.type === "step" && e.ok) repairs.push(...e.repairs);
        else if (e.type === "done")
          add({
            role: "result",
            text:
              e.steps === 0
                ? t("build.chat.nothing")
                : e.refused > 0
                  ? t("build.chat.doneRefused", { steps: e.steps, refused: e.refused })
                  : t("build.chat.done", { steps: e.steps }),
            ...(repairs.length ? { details: repairs } : {}),
          });
        else if (e.type === "error") add({ role: "error", text: errorText(e.code) });
      }
    } catch (e) {
      if (controller.signal.aborted) add({ role: "error", text: t("build.chat.stopped") });
      else add({ role: "error", text: errorText(errorCode(e)) });
    } finally {
      progress(undefined);
      setRunning(false);
      abort.current = null;
    }
  };

  const ai = settings.data;
  const reachable = ai !== undefined && ai.transport !== "none";
  const on = reachable && ai.settings.enabled;
  return (
    <SectionCard
      title={t("build.chat.title")}
      icon={<Sparkle />}
      description={on ? t("build.chat.description") : undefined}
    >
      {settings.isPending ? (
        <div className="grid gap-3">
          <SkeletonLine minWidth={50} maxWidth={80} />
          <SkeletonLine minWidth={30} maxWidth={60} />
        </div>
      ) : !on ? (
        <SectionEmpty
          icon={<Sparkle size={32} className="text-kumo-inactive" />}
          title={reachable ? t("build.chat.off") : t("build.chat.unavailable")}
          description={reachable ? t("build.chat.offHint") : t("build.chat.unavailableHint")}
          contents={
            reachable ? (
              <LinkButton href={`/sites/${siteId}/settings`} variant="secondary" icon={GearSix}>
                {t("build.chat.settings")}
              </LinkButton>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-6">
          {items.length > 0 && <BuildChatLog items={items} label={t("build.chat.label")} />}
          {settings.error && (
            <Banner
              variant="error"
              icon={<WarningCircle weight="fill" />}
              title={errorText(undefined)}
            />
          )}
          <div className="grid gap-3">
            <InputArea
              className="w-full"
              label={t("build.chat.brief")}
              placeholder={t("build.chat.placeholder")}
              value={message}
              maxLength={2000}
              onValueChange={setMessage}
              disabled={running}
              data-testid="build-brief"
            />
            <div className="flex justify-end gap-2">
              {running ? (
                <Button
                  variant="secondary"
                  icon={<StopCircle />}
                  onClick={() => abort.current?.abort()}
                >
                  {t("build.chat.stop")}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  icon={<Sparkle />}
                  disabled={!message.trim()}
                  onClick={() => void send()}
                  data-testid="build-send"
                >
                  {t("build.chat.send")}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
