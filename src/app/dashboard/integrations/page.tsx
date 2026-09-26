"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import ActionToast from "@/components/ActionToast";
import { apiRequest, userErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { Integration } from "@/lib/types";
import { ArrowRight, CheckCircle, ChevronDown, Cloud, Copy, ExternalLink, HardDrive, Info, KeyRound, Link2, RefreshCw, Settings, ShieldCheck, TestTube2, Unplug, X } from "lucide-react";

type ProviderId = "dropbox" | "google_drive" | "onedrive" | "box";
type CredentialSource = "organization" | "platform" | "none";

type ProviderCredentialStatus = {
  configured: boolean;
  oauthConfigured: boolean;
  oauthSource: CredentialSource;
  organizationConfigured: boolean;
  platformConfigured: boolean;
  clientIdHint: string | null;
  clientSecretConfigured: boolean;
  apiKeyConfigured: boolean;
  apiKeySource: CredentialSource;
  apiKeyHint: string | null;
  supportsCustomCredentials: boolean;
};

type ProviderConfigState = Record<ProviderId, ProviderCredentialStatus> & {
  pcloud: ProviderCredentialStatus & { connectionMode: "public_link" };
  secretStorageConfigured: boolean;
};

const emptyStatus: ProviderCredentialStatus = {
  configured: false,
  oauthConfigured: false,
  oauthSource: "none",
  organizationConfigured: false,
  platformConfigured: false,
  clientIdHint: null,
  clientSecretConfigured: false,
  apiKeyConfigured: false,
  apiKeySource: "none",
  apiKeyHint: null,
  supportsCustomCredentials: true,
};

const emptyConfig: ProviderConfigState = {
  google_drive: emptyStatus,
  dropbox: emptyStatus,
  onedrive: emptyStatus,
  box: emptyStatus,
  pcloud: { ...emptyStatus, configured: true, supportsCustomCredentials: false, connectionMode: "public_link" },
  secretStorageConfigured: false,
};

const providers: Array<{
  id: ProviderId;
  name: string;
  description: string;
  icon: typeof Cloud;
  color: string;
  features: string[];
}> = [
  {
    id: "dropbox",
    name: "Dropbox",
    description: "Connect Dropbox for authenticated shared-folder and private-link imports. Public single-file links can still import without OAuth.",
    icon: Cloud,
    color: "from-[#0061FE] to-[#0047CC]",
    features: ["OAuth 2.0", "Public single files", "Shared folders", "Organization credentials"],
  },
  {
    id: "google_drive",
    name: "Google Drive",
    description: "Public Google Drive file/folder links are tried directly first; use an API key for public discovery fallback or OAuth for restricted links.",
    icon: HardDrive,
    color: "from-[#4285F4] to-[#34A853]",
    features: ["OAuth 2.0", "Optional API key", "Public links", "Organization credentials"],
  },
  {
    id: "onedrive",
    name: "OneDrive",
    description: "Connect Microsoft OneDrive for authenticated shared-file and shared-folder imports. The platform reads/downloads content through Microsoft Graph.",
    icon: Cloud,
    color: "from-[#0078D4] to-[#28A8EA]",
    features: ["Microsoft OAuth", "Shared links", "Refresh tokens", "Organization credentials"],
  },
  {
    id: "box",
    name: "Box",
    description: "Connect Box so Link Import can resolve shared files and folders through the Box Shared Item API.",
    icon: Cloud,
    color: "from-[#0061D5] to-[#003C8F]",
    features: ["OAuth 2.0", "Shared Item API", "Refresh tokens", "Organization credentials"],
  },
];



type ProviderSetupGuide = {
  summary: string;
  steps: string[];
  providerUrl: string;
  providerLinkLabel: string;
  fieldHelp: {
    clientId: string;
    clientSecret: string;
    apiKey?: string;
  };
};

const providerSetupGuides: Record<ProviderId, ProviderSetupGuide> = {
  google_drive: {
    summary: "Create a Google OAuth web application for restricted Drive links. An API key is optional and is used only as a public-link discovery fallback.",
    steps: [
      "Open Google Cloud, select or create a project, and enable the Google Drive API.",
      "Create an OAuth 2.0 Client ID with application type Web application.",
      "Add the redirect URL shown below to Authorized redirect URIs.",
      "Copy the Client ID and Client Secret into this form. Optionally create an API key for public-link discovery fallback.",
      "Save here, then use Connect Google Drive to authorize the provider account.",
    ],
    providerUrl: "https://developers.google.com/identity/protocols/oauth2/web-server",
    providerLinkLabel: "Google OAuth setup",
    fieldHelp: {
      clientId: "OAuth Client ID from your Google Cloud project's Web application credential.",
      clientSecret: "OAuth Client Secret for the same Web application. Treat this value as confidential.",
      apiKey: "Optional Google API key used for public Drive link discovery; it does not replace OAuth for restricted content.",
    },
  },
  dropbox: {
    summary: "Create a Dropbox API app so authenticated shared folders and restricted links can be imported through OAuth 2.0.",
    steps: [
      "Open the Dropbox App Console and create an API app.",
      "Enable the scopes account_info.read, files.metadata.read, and files.content.read.",
      "Add the redirect URL shown below to the app's OAuth 2 redirect URIs.",
      "Copy the App key as Client ID and App secret as Client Secret.",
      "Save here, then use Connect Dropbox to authorize the provider account.",
    ],
    providerUrl: "https://www.dropbox.com/developers/apps",
    providerLinkLabel: "Dropbox App Console",
    fieldHelp: {
      clientId: "Dropbox App key from the App Console.",
      clientSecret: "Dropbox App secret from the same app. Treat this value as confidential.",
    },
  },
  onedrive: {
    summary: "Register a Microsoft Entra web application for OneDrive access through Microsoft Graph.",
    steps: [
      "Open Microsoft Entra admin center and create an App registration.",
      "Add a Web redirect URI using the exact redirect URL shown below.",
      "Add Microsoft Graph delegated permissions used by this integration: User.Read, Files.ReadWrite, and offline_access.",
      "Create a client secret under Certificates & secrets and copy its Value immediately.",
      "Copy the Application (client) ID and secret Value here, save, then connect OneDrive.",
    ],
    providerUrl: "https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app?tabs=client-secret",
    providerLinkLabel: "Microsoft app registration",
    fieldHelp: {
      clientId: "Application (client) ID from the Microsoft Entra App registration Overview page.",
      clientSecret: "Client secret Value, not the secret ID. Microsoft only displays the Value when the secret is created.",
    },
  },
  box: {
    summary: "Create a Box Platform application using OAuth 2.0 so shared Box files and folders can be resolved under the authorized user.",
    steps: [
      "Open the Box Developer Console and create a Custom App.",
      "Choose OAuth 2.0 with User Authentication as the authentication method.",
      "Add the redirect URL shown below to the app's OAuth 2.0 redirect URIs.",
      "Copy the Client ID and Client Secret from the app configuration.",
      "Save here, then use Connect Box to authorize the provider account.",
    ],
    providerUrl: "https://developer.box.com/guides",
    providerLinkLabel: "Box Developer Console & guides",
    fieldHelp: {
      clientId: "Client ID from the Box Custom App configuration.",
      clientSecret: "Client Secret from the same Box Custom App. Treat this value as confidential.",
    },
  },
};

function providerLabel(provider: ProviderId) {
  return provider === "google_drive" ? "Google Drive" : provider === "dropbox" ? "Dropbox" : provider === "onedrive" ? "OneDrive" : "Box";
}

function sourceLabel(source: CredentialSource) {
  if (source === "organization") return "Organization credentials";
  if (source === "platform") return "Platform credentials";
  return "Needs OAuth credentials";
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [config, setConfig] = useState<ProviderConfigState>(emptyConfig);
  const [loading, setLoading] = useState(true);
  const [workingProvider, setWorkingProvider] = useState<ProviderId | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<ProviderId | null>(null);
  const [credentialTarget, setCredentialTarget] = useState<ProviderId | null>(null);
  const [credentialForm, setCredentialForm] = useState({ clientId: "", clientSecret: "", apiKey: "" });
  const [credentialHelpOpen, setCredentialHelpOpen] = useState(false);
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [connections, providerConfig] = await Promise.all([
        apiRequest<Integration[]>("/api/integrations", { cache: "no-store" }),
        apiRequest<ProviderConfigState>("/api/integrations/config", { cache: "no-store" }),
      ]);
      setIntegrations(connections.data || []);
      setConfig(providerConfig.data);
    } catch (loadError) {
      setError(userErrorMessage(loadError, "Integrations could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const callbackError = params.get("error");
    if (connected || callbackError) window.history.replaceState({}, "", "/dashboard/integrations");
    queueMicrotask(() => {
      void load();
      if (["google_drive", "dropbox", "onedrive", "box"].includes(connected || "")) {
        setMessage(`${providerLabel(connected as ProviderId)} connected.`);
      }
      if (callbackError) setError(callbackError);
    });
  }, [load]);


  function integrationFor(provider: ProviderId) {
    return integrations.find((integration) => integration.provider === provider);
  }

  function connect(provider: ProviderId) {
    if (!config[provider]?.oauthConfigured) {
      setError(`${providerLabel(provider)} OAuth credentials are not configured for this organization or the platform.`);
      return;
    }
    window.location.assign(new URL(`/api/integrations/${provider}/connect`, window.location.origin).toString());
  }

  function openCredentialEditor(provider: ProviderId) {
    setCredentialForm({ clientId: "", clientSecret: "", apiKey: "" });
    setCredentialHelpOpen(true);
    setCopiedRedirect(false);
    setCredentialTarget(provider);
  }

  async function saveCredentials() {
    if (!credentialTarget) return;
    const provider = credentialTarget;
    setWorkingProvider(provider);
    setError(null);
    try {
      const result = await apiRequest<ProviderCredentialStatus>(`/api/integrations/config/${provider}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: credentialForm.clientId,
          clientSecret: credentialForm.clientSecret,
          ...(provider === "google_drive" ? { apiKey: credentialForm.apiKey } : {}),
        }),
      });
      setConfig((current) => ({ ...current, [provider]: result.data }));
      setCredentialTarget(null);
      setMessage(result.message || `${providerLabel(provider)} organization credentials saved.`);
    } catch (actionError) {
      setError(userErrorMessage(actionError, "Provider credentials could not be saved."));
    } finally {
      setWorkingProvider(null);
    }
  }

  async function removeCustomCredentials() {
    if (!credentialTarget) return;
    const provider = credentialTarget;
    setWorkingProvider(provider);
    setError(null);
    try {
      const result = await apiRequest<ProviderCredentialStatus>(`/api/integrations/config/${provider}`, { method: "DELETE" });
      setConfig((current) => ({ ...current, [provider]: result.data }));
      setCredentialTarget(null);
      setMessage(result.message || `${providerLabel(provider)} now uses platform fallback credentials.`);
    } catch (actionError) {
      setError(userErrorMessage(actionError, "Custom credentials could not be removed."));
    } finally {
      setWorkingProvider(null);
    }
  }

  async function toggle(provider: ProviderId, enabled: boolean) {
    setWorkingProvider(provider);
    setError(null);
    try {
      const result = await apiRequest<Integration>(`/api/integrations/${provider}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: enabled }),
      });
      setIntegrations((current) => current.map((item) => item.provider === provider ? result.data : item));
      setMessage(result.message || (enabled ? "Integration enabled." : "Integration disabled."));
    } catch (actionError) {
      setError(userErrorMessage(actionError, "Integration could not be updated."));
    } finally {
      setWorkingProvider(null);
    }
  }

  async function test(provider: ProviderId) {
    setWorkingProvider(provider);
    setError(null);
    try {
      const result = await apiRequest<{ ok: boolean; checkedAt: string }>(`/api/integrations/${provider}/test`, { method: "POST" });
      setMessage(result.message || `Connection verified at ${new Date(result.data.checkedAt).toLocaleTimeString()}.`);
      await load();
    } catch (actionError) {
      setError(userErrorMessage(actionError, "Connection test failed."));
    } finally {
      setWorkingProvider(null);
    }
  }

  async function disconnect() {
    if (!disconnectTarget) return;
    const provider = disconnectTarget;
    setWorkingProvider(provider);
    setError(null);
    try {
      const result = await apiRequest<null>(`/api/integrations/${provider}`, { method: "DELETE" });
      setIntegrations((current) => current.filter((item) => item.provider !== provider));
      setMessage(result.message || "Integration disconnected.");
      setDisconnectTarget(null);
    } catch (actionError) {
      setError(userErrorMessage(actionError, "Integration could not be disconnected."));
    } finally {
      setWorkingProvider(null);
    }
  }

  const connectedCount = useMemo(() => integrations.filter((item) => item.isEnabled).length, [integrations]);
  const activeCredentialStatus = credentialTarget ? (config[credentialTarget] ?? emptyStatus) : null;
  const activeSetupGuide = credentialTarget ? providerSetupGuides[credentialTarget] : null;
  const credentialRedirectUrl = credentialTarget && typeof window !== "undefined"
    ? `${window.location.origin}/api/integrations/${credentialTarget}/callback`
    : "";

  async function copyRedirectUrl() {
    if (!credentialRedirectUrl) return;
    try {
      await navigator.clipboard.writeText(credentialRedirectUrl);
      setCopiedRedirect(true);
      window.setTimeout(() => setCopiedRedirect(false), 1600);
    } catch {
      setError("Could not copy the redirect URL. Select and copy it manually.");
    }
  }

  return (
    <DashboardLayout>
      <ActionToast message={message} error={error} onDismiss={() => { setMessage(null); setError(null); }} />
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-7 flex flex-col items-center gap-4 text-center sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:text-left">
          <div><h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-sm sm:text-3xl">Integrations</h1><p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">Secure provider connections for cloud photo workflows · {connectedCount} active</p></div>
          <Link href="/dashboard/link-import" className="glass-button-primary inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold"><Link2 className="h-4 w-4" />Link Import</Link>
        </div>

        <div className="glass-card mb-6 p-5 sm:mb-8 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1766e8]/10"><ShieldCheck className="h-6 w-6 text-[#1766e8]" /></div>
            <div>
              <h3 className="mb-1 font-semibold text-slate-900">Organization-aware provider credentials</h3>
              <p className="text-sm text-slate-600">OAuth tokens and custom provider credentials are encrypted server-side. Organization credentials override platform credentials; removing them restores platform fallback. Secrets are never returned to this page after saving.</p>
              {!config.secretStorageConfigured && <p className="mt-2 text-sm font-semibold text-amber-700">Configure PHOTO_INTEGRATION_SECRET_KEY before storing organization credentials in production.</p>}
            </div>
          </div>
        </div>

        <div data-testid="integrations-provider-surface" className="space-y-4 sm:space-y-5">
          {loading && (
            <div data-testid="integrations-refresh-status" role="status" className="glass-card px-4 py-3 text-center text-sm text-slate-600">
              Refreshing provider connection and credential status…
            </div>
          )}
            {providers.map((provider) => {
              const integration = integrationFor(provider.id);
              const isConnected = Boolean(integration);
              const status = config[provider.id] || emptyStatus;
              const ProviderIcon = provider.icon;
              const busy = workingProvider === provider.id;
              const metadata = (integration?.metadata || {}) as Record<string, unknown>;
              return (
                <div key={provider.id} data-provider-id={provider.id} data-testid={`provider-card-${provider.id}`} className="glass-card p-5 sm:p-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
                    <div className={cn("flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br", provider.color)}><ProviderIcon className="h-8 w-8 text-white" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div><h3 className="text-xl font-bold text-slate-900">{provider.name}</h3><p className="text-slate-600">{provider.description}</p></div>
                        <div className="flex flex-wrap gap-2">
                          <span className={cn("badge", status.oauthConfigured ? "badge-success" : "badge-warning")}>{sourceLabel(status.oauthSource)}</span>
                          {provider.id === "google_drive" && status.apiKeyConfigured && <span className="badge badge-success">API key · {status.apiKeySource}</span>}
                          {isConnected && <span className={cn("badge", integration?.isEnabled ? "badge-success" : "badge-warning")}>{integration?.isEnabled ? "Connected" : "Disabled"}</span>}
                        </div>
                      </div>

                      <div className="mb-4 flex flex-wrap gap-2">{provider.features.map((feature) => <span key={feature} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{feature}</span>)}</div>

                      <div className="mb-4 rounded-lg border border-slate-200 bg-white/65 p-3 text-sm text-slate-600">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>OAuth app: <strong className="text-slate-900">{status.oauthConfigured ? sourceLabel(status.oauthSource) : "Not configured"}</strong>{status.clientIdHint ? ` · ${status.clientIdHint}` : ""}</span>
                          <button data-testid={`configure-provider-${provider.id}`} onClick={() => openCredentialEditor(provider.id)} className="glass-button inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700"><KeyRound className="h-4 w-4" />Configure credentials</button>
                        </div>
                        {provider.id === "google_drive" && <p className="mt-2">Drive API key: <strong className="text-slate-900">{status.apiKeyConfigured ? `${status.apiKeySource}${status.apiKeyHint ? ` · ${status.apiKeyHint}` : ""}` : "Not configured — public links are tried anonymously first"}</strong></p>}
                      </div>

                      {isConnected && integration && (
                        <div className="mb-4 rounded-lg bg-slate-50 p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-center gap-3"><CheckCircle className="h-5 w-5 shrink-0 text-emerald-500" /><div className="min-w-0"><p className="truncate font-medium text-slate-900">{integration.accountName || provider.name}</p><p className="truncate text-sm text-slate-500">{integration.accountEmail || "Provider account connected"}</p>{typeof metadata.lastCheckedAt === "string" && <p className="mt-1 text-xs text-slate-400">Last verified {new Date(metadata.lastCheckedAt).toLocaleString()}</p>}</div></div>
                            <div className="flex flex-wrap justify-end gap-2">
                              <button disabled={busy} onClick={() => void test(provider.id)} className="glass-button flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"><TestTube2 className="h-4 w-4" />Test</button>
                              <button disabled={busy} onClick={() => void toggle(provider.id, !integration.isEnabled)} className="glass-button flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"><RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />{integration.isEnabled ? "Disable" : "Enable"}</button>
                              <button disabled={busy} onClick={() => setDisconnectTarget(provider.id)} className="glass-button flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 disabled:opacity-50"><Unplug className="h-4 w-4" />Disconnect</button>
                            </div>
                          </div>
                        </div>
                      )}

                      {!isConnected && <button onClick={() => connect(provider.id)} disabled={busy || !status.oauthConfigured} className="glass-button-primary flex items-center gap-2 rounded-xl px-6 py-3 font-medium disabled:cursor-not-allowed disabled:opacity-50">Connect {provider.name}<ArrowRight className="h-5 w-5" /></button>}
                      {isConnected && status.oauthConfigured && <button onClick={() => connect(provider.id)} className="text-sm font-semibold text-[#1766e8] hover:underline">Reconnect / rotate authorization</button>}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="glass-card p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500"><Cloud className="h-6 w-6 text-white" /></div>
                <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold text-slate-900">pCloud Import</h3><span className="badge badge-success">No credentials required</span></div><p className="mt-1 text-sm text-slate-600">Current pCloud Link Import uses pCloud public-link APIs and therefore does not store a client ID, client secret, API key, or account token. If authenticated pCloud import is added later, it should use the same organization credential resolver.</p></div>
              </div>
            </div>
        </div>

        <div className="mt-10 sm:mt-12"><h2 className="mb-5 text-center text-lg font-bold text-white sm:mb-6 sm:text-xl">Planned providers</h2><div className="grid grid-cols-1 gap-6"><div className="glass-card p-6 opacity-60"><div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-200"><Settings className="h-6 w-6 text-slate-400" /></div><div><h3 className="font-semibold text-slate-900">Adobe Lightroom</h3><p className="text-sm text-slate-500">Collection-based import workflow</p></div><span className="badge badge-primary ml-auto">Planned</span></div></div></div></div>
      </div>

      {credentialTarget && activeCredentialStatus && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.currentTarget === event.target) setCredentialTarget(null); }}>
          <div data-testid="provider-credentials-dialog" role="dialog" aria-modal="true" aria-labelledby="provider-credentials-title" className="my-3 w-full max-w-xl max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:my-4 sm:max-h-[calc(100dvh-2rem)] sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><h2 id="provider-credentials-title" className="text-xl font-bold text-slate-900">{providerLabel(credentialTarget)} credentials</h2><p className="mt-2 text-sm text-slate-600">Custom values are encrypted for the active organization and override platform fallback credentials. Saved secrets are never returned to the browser.</p></div><button type="button" aria-label="Close credentials" onClick={() => setCredentialTarget(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>

            <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <p>Current OAuth source: <strong className="text-slate-900">{sourceLabel(activeCredentialStatus.oauthSource)}</strong>{activeCredentialStatus.clientIdHint ? ` · ${activeCredentialStatus.clientIdHint}` : ""}</p>
              {credentialTarget === "google_drive" && <p className="mt-1">Current API-key source: <strong className="text-slate-900">{activeCredentialStatus.apiKeySource === "none" ? "None" : activeCredentialStatus.apiKeySource}</strong>{activeCredentialStatus.apiKeyHint ? ` · ${activeCredentialStatus.apiKeyHint}` : ""}</p>}
            </div>

            {activeSetupGuide && (
              <div className="mt-4 overflow-hidden rounded-xl border border-blue-200 bg-blue-50/60">
                <button type="button" data-testid="provider-credential-help-toggle" aria-expanded={credentialHelpOpen} onClick={() => setCredentialHelpOpen((open) => !open)} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left">
                  <div className="flex items-start gap-3"><Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" /><div><p className="text-sm font-bold text-slate-900">How to get these credentials</p><p className="mt-0.5 text-xs text-slate-600">{activeSetupGuide.summary}</p></div></div>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform", credentialHelpOpen && "rotate-180")} />
                </button>
                {credentialHelpOpen && (
                  <div className="border-t border-blue-200 px-4 py-4">
                    <ol className="space-y-2 text-sm text-slate-700">
                      {activeSetupGuide.steps.map((step, index) => <li key={step} className="flex gap-3"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-700">{index + 1}</span><span>{step}</span></li>)}
                    </ol>
                    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Redirect URL</p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center"><code data-testid="provider-credential-redirect-url" className="min-w-0 flex-1 break-all rounded-md bg-slate-100 px-2 py-1.5 text-xs text-slate-800">{credentialRedirectUrl}</code><button type="button" onClick={() => void copyRedirectUrl()} className="glass-button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700"><Copy className="h-3.5 w-3.5" />{copiedRedirect ? "Copied" : "Copy"}</button></div>
                    </div>
                    <a data-testid="provider-credential-help-link" href={activeSetupGuide.providerUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1766e8] hover:underline">Open {activeSetupGuide.providerLinkLabel}<ExternalLink className="h-3.5 w-3.5" /></a>
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 space-y-4">
              <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-800">Client ID{credentialTarget === "google_drive" ? " (optional when using API key only)" : ""}<span title={activeSetupGuide?.fieldHelp.clientId} className="cursor-help text-slate-400"><Info className="h-3.5 w-3.5" /></span></span><input value={credentialForm.clientId} onChange={(event) => setCredentialForm((current) => ({ ...current, clientId: event.target.value }))} autoComplete="off" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#1766e8]" placeholder="Paste provider application Client ID" /></label>
              <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-800">Client Secret{credentialTarget === "google_drive" ? " (optional when using API key only)" : ""}<span title={activeSetupGuide?.fieldHelp.clientSecret} className="cursor-help text-slate-400"><Info className="h-3.5 w-3.5" /></span></span><input type="password" value={credentialForm.clientSecret} onChange={(event) => setCredentialForm((current) => ({ ...current, clientSecret: event.target.value }))} autoComplete="new-password" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#1766e8]" placeholder="Paste provider application Client Secret" /></label>
              {credentialTarget === "google_drive" && <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-800">Google Drive API Key (optional)<span title={activeSetupGuide?.fieldHelp.apiKey} className="cursor-help text-slate-400"><Info className="h-3.5 w-3.5" /></span></span><input type="password" value={credentialForm.apiKey} onChange={(event) => setCredentialForm((current) => ({ ...current, apiKey: event.target.value }))} autoComplete="new-password" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#1766e8]" placeholder="Paste API key for public-link discovery fallback" /></label>}
            </div>

            <p className="mt-4 text-xs text-slate-500">Saving replaces this organization&apos;s existing custom credential set. If OAuth app credentials change, reconnect the provider so future token refreshes use the same application that issued the authorization.</p>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <div>{activeCredentialStatus.organizationConfigured && <button disabled={workingProvider === credentialTarget} onClick={() => void removeCustomCredentials()} className="rounded-lg px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Use platform fallback</button>}</div>
              <div className="flex justify-end gap-3"><button onClick={() => setCredentialTarget(null)} className="glass-button rounded-lg px-4 py-2 text-sm font-medium">Cancel</button><button disabled={workingProvider === credentialTarget || !config.secretStorageConfigured} onClick={() => void saveCredentials()} className="glass-button-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">Save securely</button></div>
            </div>
          </div>
        </div>
      )}

      {disconnectTarget && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) setDisconnectTarget(null); }}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-slate-900">Disconnect provider?</h2><p className="mt-2 text-sm text-slate-600">The encrypted account authorization will be removed and provider revocation will be attempted. Organization application credentials are kept until you remove them separately.</p></div><button onClick={() => setDisconnectTarget(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><div className="mt-6 flex justify-end gap-3"><button onClick={() => setDisconnectTarget(null)} className="glass-button rounded-lg px-4 py-2 text-sm font-medium">Cancel</button><button onClick={() => void disconnect()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Disconnect</button></div></div>
        </div>
      )}
    </DashboardLayout>
  );
}
