import { Button, InsetPanel, Text } from "@cloudhal/ui";
import { Copy, Globe, Translate } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { useT } from "../i18n/index.tsx";
import { NewSiteDialog } from "./NewSiteDialog.tsx";
import { useGate } from "./useMe.ts";

function Choice({ icon, title, children }: { icon: ReactNode; title: string; children: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="flex h-lh items-center text-kumo-subtle">{icon}</span>
      <span className="grid gap-0.5">
        <Text as="span" bold>
          {title}
        </Text>
        <Text as="span" variant="secondary" size="sm">
          {children}
        </Text>
      </span>
    </div>
  );
}

/**
 * Site › Settings › Languages (RFC-0034 §7, UX report §4b): another language in this site, or a
 * separate site as a language edition — what each gives and gives up, and the way to an edition.
 */
export function EditionGuide({ siteId }: { siteId: string }) {
  const t = useT();
  const create = useGate("sites.create");
  const [open, setOpen] = useState(false);
  return (
    <InsetPanel label={t("editionGuide.title")}>
      <div className="grid gap-3" data-testid="edition-guide">
        <Choice icon={<Translate size={16} />} title={t("editionGuide.hereTitle")}>
          {t("editionGuide.here")}
        </Choice>
        <Choice icon={<Globe size={16} />} title={t("editionGuide.editionTitle")}>
          {t("editionGuide.edition")}
        </Choice>
        <div>
          <Button
            variant="secondary"
            icon={<Copy size={16} />}
            disabled={!create.allowed}
            title={create.reason}
            onClick={() => setOpen(true)}
          >
            {t("editionGuide.create")}
          </Button>
        </div>
      </div>
      <NewSiteDialog open={open} onOpenChange={setOpen} from={siteId} />
    </InsetPanel>
  );
}
