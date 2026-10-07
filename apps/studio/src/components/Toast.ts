import { useKumoToastManager } from "@cloudhal/ui";

/** Small wrapper so screens don't depend on Kumo's toast API shape. */
export function useToast() {
  const manager = useKumoToastManager();
  return {
    success: (title: string, description?: string) =>
      manager.add({ title, description, type: "success" } as never),
    error: (title: string, description?: string) =>
      manager.add({ title, description, type: "error" } as never),
  };
}
