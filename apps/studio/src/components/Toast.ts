import { useKumoToastManager } from "@cloudhal/ui";

/** A notice toast's button: Kumo renders `actions` as small secondary `Button`s under the text. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

/** How long a notice (something that needs the person) stays before it slides away. */
const NOTICE_TIMEOUT_MS = 15_000;

/** At most two actions per toast (DESIGN.md §2n). */
const MAX_ACTIONS = 2;

/** Small wrapper so screens don't depend on Kumo's toast API shape. */
export function useToast() {
  const manager = useKumoToastManager();
  /** Kumo's action buttons; an action closes the toast it sits on. */
  const buttons = (close: () => void, actions: readonly ToastAction[] | undefined) =>
    actions?.slice(0, MAX_ACTIONS).map((action) => ({
      children: action.label,
      variant: "secondary",
      size: "sm",
      onClick: () => {
        close();
        action.onClick();
      },
    }));
  return {
    /** Done; `actions` (at most two) offer the next step, e.g. "View site" after a publish. */
    success: (title: string, description?: string, actions?: readonly ToastAction[]) => {
      let id = "";
      id = manager.add({
        title,
        description,
        type: "success",
        actions: buttons(() => manager.close(id), actions),
      } as never) as unknown as string;
      return id;
    },
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
      /** How long it stays (ms): 15 s by default; "Undo" offers 10 s. */
      timeout?: number;
    }) =>
      manager.add({
        id: options.id,
        title: options.title,
        description: options.description,
        variant: options.tone,
        timeout: options.timeout ?? NOTICE_TIMEOUT_MS,
        actions: buttons(() => manager.close(options.id), options.actions),
      } as never),
  };
}
