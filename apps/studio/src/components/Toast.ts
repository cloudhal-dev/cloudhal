import { useKumoToastManager } from "@cloudhal/ui";

/** A notice toast's button: Kumo renders `actions` as small secondary `Button`s under the text. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

/** How long a notice (something that needs the person) stays before it slides away. */
const NOTICE_TIMEOUT_MS = 15_000;

/** Small wrapper so screens don't depend on Kumo's toast API shape. */
export function useToast() {
  const manager = useKumoToastManager();
  return {
    success: (title: string, description?: string) =>
      manager.add({ title, description, type: "success" } as never),
    error: (title: string, description?: string) =>
      manager.add({ title, description, type: "error" } as never),
    /**
     * Something that needs the person (DESIGN.md §2n): a toned toast with its own id (Kumo shows an
     * id once, even if it is added again) and up to two actions; an action closes the toast.
     */
    notice: (options: {
      id: string;
      title: string;
      description?: string;
      tone: "warning" | "info";
      actions?: ToastAction[];
    }) =>
      manager.add({
        id: options.id,
        title: options.title,
        description: options.description,
        variant: options.tone,
        timeout: NOTICE_TIMEOUT_MS,
        actions: options.actions?.map((action) => ({
          children: action.label,
          variant: "secondary",
          size: "sm",
          onClick: () => {
            manager.close(options.id);
            action.onClick();
          },
        })),
      } as never),
  };
}
