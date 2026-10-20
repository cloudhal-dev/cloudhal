import { PlaygroundBar } from "@cloudhal/ui";
import { useEffect, useState } from "react";
import { useT } from "../i18n/index.tsx";
import { minutesLeft, usePlayground } from "./usePlayground.ts";

/**
 * The playground session bar (RFC-0036 §5): time left, Reset and "Deploy to Cloudflare", under the
 * top bar on every screen. When the time is up, or after Reset, the browser goes back to the
 * playground's landing page, which starts a new session.
 */
export function PlaygroundSessionBar() {
  const t = useT();
  const playground = usePlayground();
  const [now, setNow] = useState(() => Date.now());
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!playground) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [playground]);

  const left = playground ? minutesLeft(playground.expiresAt, now) : 1;
  useEffect(() => {
    if (playground && left === 0) globalThis.location.assign("/");
  }, [playground, left]);

  if (!playground) return null;
  const reset = async () => {
    setResetting(true);
    await fetch(playground.resetUrl, { method: "POST", credentials: "same-origin" }).catch(
      () => undefined,
    );
    globalThis.location.assign("/");
  };
  return (
    <PlaygroundBar
      className="rounded-none border-x-0 border-t-0"
      labels={{
        title: t("playground.title"),
        description: t("playground.description", { count: left }),
        reset: t("playground.reset"),
        deploy: t("playground.deploy"),
      }}
      deployHref={playground.deployUrl}
      onReset={() => void reset()}
      resetting={resetting}
    />
  );
}
