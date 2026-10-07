import { ShikiProvider } from "@cloudhal/ui/code";
import type { ReactNode } from "react";
import { useT } from "../i18n/index.tsx";

/**
 * Syntax highlighting for `CodeHighlighted` (config snippets, tool input). Shiki and the grammars
 * load lazily on first use; the copy button speaks the active locale.
 */
export function CodeProvider({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <ShikiProvider
      engine="javascript"
      languages={["json", "bash"]}
      labels={{ copy: t("common.copy"), copied: t("common.copied") }}
    >
      {children}
    </ShikiProvider>
  );
}
