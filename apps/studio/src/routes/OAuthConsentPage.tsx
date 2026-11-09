/**
 * `/oauth/consent` (RFC-0044 §4): where a remote MCP client's authorization request lands once
 * the member is signed in. It shows who is asking (the client, the host it is identified by, the
 * host it sends the browser back to), what it may do (the requested scopes, each as the member's
 * role turns it; what the role does not give is shown disabled and left out) and the agent mode
 * (Decision 4). Approve and Deny go to `/api/agent-grants/consent`, which answers where the browser
 * goes next. The page's own query string is the provider's signed request, read as it came.
 */
import { Banner, Button, Checkbox, InsetPanel, PageLayout, SectionCard, Text } from "@cloudhal/ui";
import {
  Desktop,
  Globe,
  PlugsConnected,
  ShieldCheck,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AutoModeConfirm, ModePicker } from "../components/AgentModes.tsx";
import { useT } from "../i18n/index.tsx";
import {
  type AgentScope,
  api,
  type ConsentInfo,
  type ConsentScope,
  type KeyMode,
} from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";

/** The signed authorization request, untouched (re-encoding it would break the signature). */
function signedRequest(): string {
  return typeof window === "undefined" ? "" : window.location.search.slice(1);
}

export function OAuthConsentPage() {
  const t = useT();
  const c = useT("oauthConsent");
  const [request] = useState(signedRequest);
  const info = useQuery({
    queryKey: ["oauth-consent", request],
    queryFn: () => api.agentGrants.consentInfo(request),
    enabled: request.length > 0,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const client = info.data?.client;
  const name = client?.name ?? "";
  // A metadata-document client's host is its identity: it stays in view whatever the name says.
  const title = client?.host
    ? c("oauthConsent.titleFrom", { client: name, host: client.host })
    : c("oauthConsent.title", { client: name });
  return (
    <PageLayout
      icon={<PlugsConnected size={24} />}
      title={title}
      description={c("oauthConsent.description")}
      loading={info.isPending && request.length > 0}
      width="narrow"
    >
      {info.data ? (
        <ConsentForm request={request} info={info.data} />
      ) : (
        (info.isError || request.length === 0) && (
          <Banner
            variant="error"
            title={c("oauthConsent.invalid.title")}
            description={
              info.error ? apiErrorText(t, info.error) : c("oauthConsent.invalid.description")
            }
          />
        )
      )}
    </PageLayout>
  );
}

/**
 * How each requested scope reads, and whether it starts ticked: a step-up starts from what the
 * connection may do today; what it newly asks for is marked and left unticked.
 */
function useScopeLabels(info: ConsentInfo) {
  const t = useT();
  const c = useT("oauthConsent");
  const granted = (s: ConsentScope) =>
    s.granted !== null && (info.existing?.scopes.includes(s.granted) ?? true);
  // The scope's description, as the agent-key screens word it (`*` never reaches a token).
  const label = (scope: AgentScope) =>
    scope === "*" ? t("agents.fullAccess") : t(`agents.scopes.${scope}`);
  const scopeLabel = (s: ConsentScope): string => {
    if (s.granted === null)
      return c("oauthConsent.scopes.notInRole", { label: label(s.requested) });
    const text =
      s.granted !== s.requested
        ? c("oauthConsent.scopes.narrowed", { label: label(s.requested), scope: s.granted })
        : label(s.requested);
    return info.existing && !granted(s) ? c("oauthConsent.scopes.added", { label: text }) : text;
  };
  return { granted, scopeLabel };
}

function ConsentForm({ request, info }: { request: string; info: ConsentInfo }) {
  const t = useT();
  const c = useT("oauthConsent");
  const grantable = info.scopes.filter((s) => s.granted !== null).map((s) => s.requested);
  const { granted, scopeLabel } = useScopeLabels(info);
  const [chosen, setChosen] = useState<AgentScope[]>(
    info.scopes.filter(granted).map((s) => s.requested),
  );
  const [mode, setMode] = useState<KeyMode>(info.defaultMode);
  // Auto publishes without a person: explicit consent first, as for a key (DESIGN.md §2g).
  const [autoConfirmed, setAutoConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const needsConsent = mode === "auto" && info.existing?.mode !== "auto";
  const decide = useMutation({
    mutationFn: (accept: boolean) =>
      api.agentGrants.consent({ request, accept, scopes: accept ? chosen : [], mode }),
    onSuccess: ({ redirect }) => window.location.assign(redirect),
  });
  const busy = decide.isPending || decide.isSuccess;
  return (
    <div className="grid gap-6">
      {decide.isError && <Banner variant="error" description={apiErrorText(t, decide.error)} />}
      <WhoIsAsking info={info} />
      <SectionCard
        icon={<ShieldCheck size={16} />}
        title={c("oauthConsent.scopes.title")}
        description={c("oauthConsent.scopes.description")}
      >
        <div className="grid gap-3">
          <Checkbox.Group
            legend={c("oauthConsent.scopes.legend")}
            value={chosen}
            allValues={grantable}
            disabled={busy}
            onValueChange={(v: string[]) => setChosen(v as AgentScope[])}
          >
            {info.scopes.map((s) => (
              <Checkbox.Item
                key={s.requested}
                value={s.requested}
                disabled={s.granted === null}
                label={scopeLabel(s)}
              />
            ))}
          </Checkbox.Group>
          {info.offlineAccess && (
            <Text variant="secondary" size="sm">
              {c("oauthConsent.scopes.offline")}
            </Text>
          )}
          {info.sites && (
            <Text variant="secondary" size="sm">
              {c("oauthConsent.scopes.sites", { count: info.sites.length })}
            </Text>
          )}
          {chosen.length === 0 && (
            <Text variant="secondary" size="sm">
              {c("oauthConsent.scopes.none")}
            </Text>
          )}
        </div>
      </SectionCard>
      <SectionCard
        icon={<SlidersHorizontal size={16} />}
        title={c("oauthConsent.mode.title")}
        description={c("oauthConsent.mode.description")}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              loading={decide.isPending && decide.variables === false}
              onClick={() => decide.mutate(false)}
            >
              {c("oauthConsent.deny")}
            </Button>
            <Button
              variant="primary"
              disabled={busy || chosen.length === 0}
              loading={decide.isPending && decide.variables === true}
              onClick={() => {
                setSubmitted(true);
                if (!needsConsent || autoConfirmed) decide.mutate(true);
              }}
            >
              {c("oauthConsent.approve")}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <ModePicker
            value={mode}
            onValueChange={(next) => {
              setMode(next);
              setAutoConfirmed(false);
              setSubmitted(false);
            }}
            legend={c("oauthConsent.mode.legend")}
            only={info.modes}
          />
          {needsConsent && (
            <AutoModeConfirm
              checked={autoConfirmed}
              onCheckedChange={setAutoConfirmed}
              showError={submitted}
            />
          )}
        </div>
      </SectionCard>
    </div>
  );
}

/**
 * Who is asking (§4 item 1): a document client's host first, the self-asserted name, how the
 * server knows the client, where the browser goes back to, and the warnings.
 */
function WhoIsAsking({ info }: { info: ConsentInfo }) {
  const c = useT("oauthConsent");
  return (
    <SectionCard icon={<Globe size={16} />} title={c("oauthConsent.who.title")}>
      <div className="grid gap-3">
        <InsetPanel>
          <div className="grid gap-1.5">
            {info.client.host && (
              <Text bold>{c("oauthConsent.who.fromHost", { host: info.client.host })}</Text>
            )}
            <Text>{info.client.name}</Text>
            {!info.client.host && (
              <Text variant="secondary" size="sm">
                {info.client.kind === "self-registered"
                  ? c("oauthConsent.who.selfRegistered")
                  : c("oauthConsent.who.registered")}
              </Text>
            )}
            <Text variant="secondary" size="sm">
              {info.redirect.app
                ? c("oauthConsent.who.thisComputerApp", { scheme: info.redirect.app })
                : info.redirect.loopback
                  ? c("oauthConsent.who.thisComputer")
                  : c("oauthConsent.who.sendsBack", { host: info.redirect.host })}
            </Text>
          </div>
        </InsetPanel>
        {info.client.lookalike && (
          <Banner
            variant="alert"
            description={c("oauthConsent.who.lookalike", { client: info.client.lookalike })}
          />
        )}
        {info.loopbackOnly && (
          <Banner
            variant="alert"
            icon={<Desktop size={16} />}
            description={c("oauthConsent.who.loopbackWarning")}
          />
        )}
        {info.existing && <Banner description={c("oauthConsent.who.stepUp")} />}
      </div>
    </SectionCard>
  );
}
