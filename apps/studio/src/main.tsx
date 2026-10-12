import { LinkProvider, Toasty, TooltipProvider } from "@cloudhal/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppLink } from "./components/AppLink.tsx";
import { CodeProvider } from "./components/CodeProvider.tsx";
import { KumoLocale } from "./components/KumoLocale.tsx";
import { reloadForNewDeploy } from "./components/RouteStates.tsx";
import { I18nProvider } from "./i18n/index.tsx";
import { createStudioRouter } from "./router.tsx";
import "./styles.css";

// A deploy replaced the hashed chunks this tab was built against: reload once to get the new ones.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForNewDeploy()) event.preventDefault();
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
});
const router = createStudioRouter(queryClient);

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <I18nProvider>
      <KumoLocale>
        <QueryClientProvider client={queryClient}>
          <LinkProvider component={AppLink}>
            <TooltipProvider>
              <CodeProvider>
                <Toasty>
                  <RouterProvider router={router} />
                </Toasty>
              </CodeProvider>
            </TooltipProvider>
          </LinkProvider>
        </QueryClientProvider>
      </KumoLocale>
    </I18nProvider>
  </StrictMode>,
);
