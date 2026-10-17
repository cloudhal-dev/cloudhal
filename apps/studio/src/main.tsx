import { LinkProvider, Toasty, TooltipProvider } from "@cloudhal/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppLink } from "./components/AppLink.tsx";
import { CodeProvider } from "./components/CodeProvider.tsx";
import { KumoLocale } from "./components/KumoLocale.tsx";
import { reloadForNewDeploy } from "./components/RouteStates.tsx";
import { currentLocale, I18nProvider, type Locale, loadLocale } from "./i18n/index.tsx";
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

// The Studio's language (unless English, which is in this chunk) arrives before the first render,
// so no screen flashes English; if it cannot load, the Studio starts in English.
const start = (initialLocale?: Locale) => {
  createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>
      <I18nProvider initialLocale={initialLocale}>
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
};
loadLocale(currentLocale()).then(
  () => start(),
  () => start("en"),
);
