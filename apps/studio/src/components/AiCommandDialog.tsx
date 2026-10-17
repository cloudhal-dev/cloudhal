/**
 * "Ask AI" on a body selection (RFC-0016 §3, DESIGN.md §2y): choose a command, watch the model's
 * text arrive, then see it as a `BodyDiff` against the selection and Replace or Discard. Replace
 * goes into the editor only (the person saves as usual), and is refused when the selected blocks
 * changed while the model was writing.
 */

import { bodyDiff } from "@cloudhal/core-ts/body-blocks";
import { displayNames } from "@cloudhal/messages/format";
import {
  Banner,
  BodyDiff,
  Button,
  InputArea,
  LayerDialog,
  Select,
  SkeletonLine,
  Text,
} from "@cloudhal/ui";
import type { AiSelection } from "@cloudhal/ui/editor";
import { StopCircle, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { type AiCommandRequest, ApiRequestError, api } from "../lib/api.ts";
import { useBodyDiffLabels } from "./BodyChanges.tsx";

type Command = AiCommandRequest["command"];
type Tone = NonNullable<AiCommandRequest["tone"]>;

const COMMANDS: readonly Command[] = [
  "improve",
  "shorten",
  "expand",
  "fix",
  "tone",
  "translate",
  "custom",
];
const TONES: readonly Tone[] = ["formal", "friendly", "plain"];
/** Languages offered for "Translate", named in the UI's language. */
const LANGUAGES = ["en", "tr", "de", "fr", "es", "it", "pt", "nl", "ar", "ru", "ja", "zh"];
const ERRORS = new Set([
  "ai_budget",
  "ai_busy",
  "ai_off",
  "ai_model_unavailable",
  "ai_rate_limited",
  "ai_unavailable",
  "ai_failed",
]);

/** The model's answer without a code fence around all of it (some models add one). */
export function cleanAiOutput(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```[a-z]*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return (fenced ? (fenced[1] ?? "") : trimmed).trim();
}

type Phase = "idle" | "running" | "done";

export function AiCommandDialog({
  siteId,
  nodeId,
  pageLocale,
  selection,
  onClose,
}: {
  siteId: string;
  nodeId: string;
  /** The page's language: "Translate" offers another one first. */
  pageLocale: string;
  /** Open while set. */
  selection: AiSelection | undefined;
  onClose: () => void;
}) {
  const { t, locale } = useI18n("bodyEditor");
  const a = "bodyEditor.ai" as const;
  const labels = useBodyDiffLabels();
  const [command, setCommand] = useState<Command>("improve");
  const [tone, setTone] = useState<Tone>("plain");
  const [target, setTarget] = useState(pageLocale.startsWith("tr") ? "en" : "tr");
  const [instruction, setInstruction] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const abort = useRef<AbortController | null>(null);

  // A new selection starts over.
  useEffect(() => {
    if (!selection) return;
    setPhase("idle");
    setText("");
    setError(undefined);
  }, [selection]);
  useEffect(() => () => abort.current?.abort(), []);

  const languages = useMemo(() => {
    const names = displayNames([locale], { type: "language" });
    return Object.fromEntries(LANGUAGES.map((code) => [code, names.of(code) ?? code]));
  }, [locale]);

  const run = async () => {
    if (!selection) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setPhase("running");
    setText("");
    setError(undefined);
    const body: AiCommandRequest = {
      command,
      nodeId,
      text: selection.markdown,
      ...(command === "tone" ? { tone } : {}),
      ...(command === "translate" ? { locale: target } : {}),
      ...(command === "custom" ? { instruction: instruction.trim() } : {}),
    };
    let out = "";
    try {
      for await (const chunk of api.ai.command(siteId, body, controller.signal)) {
        out += chunk;
        setText(out);
      }
      const clean = cleanAiOutput(out);
      setText(clean);
      if (!clean) setError(t(`${a}.empty`));
      setPhase("done");
    } catch (e) {
      if (controller.signal.aborted) {
        // Stopped: keep what arrived, as a result to compare.
        const partial = cleanAiOutput(out);
        setText(partial);
        setPhase(partial ? "done" : "idle");
        return;
      }
      const code = e instanceof ApiRequestError ? e.body.error : undefined;
      setError(
        code && ERRORS.has(code)
          ? t(`${a}.errors.${code as "ai_failed"}`)
          : e instanceof Error
            ? e.message
            : String(e),
      );
      setPhase("idle");
    }
  };

  const close = () => {
    abort.current?.abort();
    onClose();
  };
  const canRun = command !== "custom" || instruction.trim().length > 0;
  const result = phase === "done" && text ? text : undefined;

  return (
    <LayerDialog.Root
      open={selection !== undefined}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <LayerDialog.Content size="lg" closeLabel={t("common.close")}>
        <LayerDialog.Title>{t(`${a}.title`)}</LayerDialog.Title>
        <LayerDialog.Description>{t(`${a}.description`)}</LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid min-w-0 gap-4" data-ai-dialog={phase}>
            <div className="flex flex-wrap items-end gap-3">
              <Select
                className="w-56 max-w-full"
                label={t(`${a}.command`)}
                value={command}
                onValueChange={(v) => setCommand(v as Command)}
                disabled={phase === "running"}
                items={Object.fromEntries(COMMANDS.map((c) => [c, t(`${a}.commands.${c}`)]))}
              />
              {command === "tone" && (
                <Select
                  className="w-48 max-w-full"
                  label={t(`${a}.tone`)}
                  value={tone}
                  onValueChange={(v) => setTone(v as Tone)}
                  disabled={phase === "running"}
                  items={Object.fromEntries(TONES.map((x) => [x, t(`${a}.tones.${x}`)]))}
                />
              )}
              {command === "translate" && (
                <Select
                  className="w-48 max-w-full"
                  label={t(`${a}.language`)}
                  value={target}
                  onValueChange={(v) => setTarget(v as string)}
                  disabled={phase === "running"}
                  items={languages}
                />
              )}
              {phase === "running" ? (
                <Button
                  variant="secondary"
                  icon={<StopCircle />}
                  onClick={() => abort.current?.abort()}
                >
                  {t(`${a}.stop`)}
                </Button>
              ) : (
                <Button variant="secondary" disabled={!canRun} onClick={() => void run()}>
                  {phase === "done" ? t(`${a}.again`) : t(`${a}.run`)}
                </Button>
              )}
            </div>
            {command === "custom" && (
              <InputArea
                className="w-full"
                label={t(`${a}.instruction`)}
                placeholder={t(`${a}.instructionPlaceholder`)}
                value={instruction}
                maxLength={500}
                onValueChange={setInstruction}
                disabled={phase === "running"}
              />
            )}
            {error && (
              <Banner
                variant="error"
                icon={<WarningCircle weight="fill" />}
                title={t(`${a}.failed`)}
                description={error}
              />
            )}
            {phase === "running" && (
              <div className="grid min-w-0 gap-1.5" role="status" aria-live="polite">
                <Text variant="secondary" size="sm">
                  {t(`${a}.writing`)}
                </Text>
                {text ? (
                  <div className="max-h-72 min-w-0 overflow-auto rounded-lg bg-kumo-recessed px-3 py-2">
                    <Text size="sm">
                      <span className="whitespace-pre-wrap break-words">{text}</span>
                    </Text>
                  </div>
                ) : (
                  <SkeletonLine minWidth={40} maxWidth={80} />
                )}
              </div>
            )}
            {result && selection && (
              <div className="grid min-w-0 gap-1.5" data-ai-result="">
                <Text variant="secondary" size="sm">
                  {t(`${a}.result`)}
                </Text>
                <BodyDiff diff={bodyDiff(selection.markdown, result)} labels={labels} />
              </div>
            )}
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            disabled={!result}
            onClick={() => {
              if (!result || !selection) return;
              if (selection.replace(result)) close();
              else setError(t(`${a}.changed`));
            }}
          >
            {t(`${a}.replace`)}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
