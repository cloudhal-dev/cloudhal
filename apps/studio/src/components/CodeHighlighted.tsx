import { CodeHighlighted as KumoCodeHighlighted, ShikiProvider } from "@cloudhal/ui/code";
import type { ComponentProps } from "react";
import { useT } from "../i18n/index.tsx";

/**
 * Kumo's `CodeHighlighted` (config snippets, tool input) with its own `ShikiProvider`, so Kumo's
 * code module, Shiki and the grammars load with the screens that show code, never with the shell
 * (bundle-budget.ts). Shiki starts when a block mounts; blocks in collapsed panels and closed
 * dialogs cost nothing. The copy button speaks the active locale.
 */
export function CodeHighlighted(props: ComponentProps<typeof KumoCodeHighlighted>) {
  const t = useT();
  return (
    <ShikiProvider
      engine="javascript"
      languages={["json", "bash"]}
      labels={{ copy: t("common.copy"), copied: t("common.copied") }}
    >
      <KumoCodeHighlighted {...props} />
    </ShikiProvider>
  );
}
