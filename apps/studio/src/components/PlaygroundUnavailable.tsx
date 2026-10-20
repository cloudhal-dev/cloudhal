import { Empty, LinkButton } from "@cloudhal/ui";
import { CloudArrowUp, LockSimple } from "@phosphor-icons/react";
import { useT } from "../i18n/index.tsx";

/**
 * Shown in place of an account screen a playground refuses (RFC-0036 §5): team, agent keys and
 * skills, account settings. They need sign-in or reach outside the session.
 */
export function PlaygroundUnavailable({ deployUrl }: { deployUrl: string }) {
  const t = useT();
  return (
    <Empty
      icon={<LockSimple size={48} className="text-kumo-inactive" />}
      title={t("playground.unavailableTitle")}
      description={t("playground.unavailableDescription")}
      contents={
        <LinkButton href={deployUrl} external variant="primary" icon={CloudArrowUp}>
          {t("playground.deploy")}
        </LinkButton>
      }
    />
  );
}
