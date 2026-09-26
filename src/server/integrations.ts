import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { integrationProviderCredentials, integrationSecrets, integrations } from "@/db/photo-schema";
import { HttpError } from "@/server/auth/errors";

export type CloudIntegrationProvider = "google_drive" | "dropbox" | "onedrive" | "box";
export type ProviderCredentialSource = "organization" | "platform" | "none";

export const cloudIntegrationProviders: CloudIntegrationProvider[] = ["google_drive", "dropbox", "onedrive", "box"];

export function isCloudIntegrationProvider(value: string): value is CloudIntegrationProvider {
  return cloudIntegrationProviders.includes(value as CloudIntegrationProvider);
}

export function cloudIntegrationProviderLabel(provider: CloudIntegrationProvider) {
  if (provider === "google_drive") return "Google Drive";
  if (provider === "dropbox") return "Dropbox";
  if (provider === "onedrive") return "OneDrive";
  return "Box";
}

type TokenPayload = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  tokenType?: string | null;
  scope?: string | null;
  oauthCredentialFingerprint?: string | null;
  oauthCredentialSource?: ProviderCredentialSource | null;
};

type ProviderCredentialPayload = {
  clientId?: string | null;
  clientSecret?: string | null;
  apiKey?: string | null;
};

type ProviderConfig = {
  provider: CloudIntegrationProvider;
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes: string[];
  credentialSource: Exclude<ProviderCredentialSource, "none">;
  credentialFingerprint: string;
};

export type ProviderCredentialStatus = {
  configured: boolean;
  oauthConfigured: boolean;
  oauthSource: ProviderCredentialSource;
  organizationConfigured: boolean;
  platformConfigured: boolean;
  clientIdHint: string | null;
  clientSecretConfigured: boolean;
  apiKeyConfigured: boolean;
  apiKeySource: ProviderCredentialSource;
  apiKeyHint: string | null;
  supportsCustomCredentials: boolean;
};

export function integrationSecretStorageConfigured() {
  return process.env.NODE_ENV !== "production" || Boolean(process.env.PHOTO_INTEGRATION_SECRET_KEY?.trim());
}

function keyMaterial() {
  const configured = process.env.PHOTO_INTEGRATION_SECRET_KEY?.trim();
  if (!integrationSecretStorageConfigured()) {
    throw new HttpError(503, "INTEGRATION_SECRET_KEY_REQUIRED", "PHOTO_INTEGRATION_SECRET_KEY must be configured before storing integration credentials.");
  }
  return createHash("sha256").update(configured || "photo-delivery-local-integration-secret").digest();
}

function encryptJson(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyMaterial(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

function decryptJson<T>(value: string): T {
  const [ivRaw, tagRaw, cipherRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !cipherRaw) throw new Error("Invalid encrypted integration secret format.");
  const decipher = createDecipheriv("aes-256-gcm", keyMaterial(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(cipherRaw, "base64url")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

function trimmed(value: string | null | undefined) {
  const next = value?.trim();
  return next || null;
}

function checkedCredential(value: unknown, label: string, max = 4096) {
  if (value == null) return null;
  if (typeof value !== "string") throw new HttpError(400, "INTEGRATION_CREDENTIAL_INVALID", `${label} must be a string.`);
  const next = value.trim();
  if (!next) return null;
  if (next.length > max) throw new HttpError(400, "INTEGRATION_CREDENTIAL_TOO_LONG", `${label} is too long.`);
  return next;
}

function credentialHint(value: string | null | undefined) {
  const raw = trimmed(value);
  if (!raw) return null;
  if (raw.length <= 8) return `${raw.slice(0, 2)}••••`;
  return `${raw.slice(0, 4)}••••${raw.slice(-4)}`;
}

function credentialFingerprint(provider: CloudIntegrationProvider, clientId: string, clientSecret: string) {
  return createHash("sha256").update(`${provider}\0${clientId}\0${clientSecret}`, "utf8").digest("hex");
}

function platformProviderCredentials(provider: CloudIntegrationProvider): ProviderCredentialPayload {
  if (provider === "google_drive") {
    return {
      clientId: trimmed(process.env.GOOGLE_DRIVE_CLIENT_ID),
      clientSecret: trimmed(process.env.GOOGLE_DRIVE_CLIENT_SECRET),
      apiKey: trimmed(process.env.GOOGLE_DRIVE_API_KEY),
    };
  }
  if (provider === "dropbox") {
    return {
      clientId: trimmed(process.env.DROPBOX_CLIENT_ID),
      clientSecret: trimmed(process.env.DROPBOX_CLIENT_SECRET),
    };
  }
  if (provider === "onedrive") {
    return {
      clientId: trimmed(process.env.ONEDRIVE_CLIENT_ID),
      clientSecret: trimmed(process.env.ONEDRIVE_CLIENT_SECRET),
    };
  }
  return {
    clientId: trimmed(process.env.BOX_CLIENT_ID),
    clientSecret: trimmed(process.env.BOX_CLIENT_SECRET),
  };
}

async function organizationProviderCredentials(organizationId: string, provider: CloudIntegrationProvider): Promise<ProviderCredentialPayload | null> {
  const [row] = await photoDb
    .select()
    .from(integrationProviderCredentials)
    .where(and(
      eq(integrationProviderCredentials.organizationId, organizationId),
      eq(integrationProviderCredentials.provider, provider),
    ))
    .limit(1);
  if (!row) return null;
  return decryptJson<ProviderCredentialPayload>(row.encryptedPayload);
}

function providerOAuthEndpoints(provider: CloudIntegrationProvider) {
  if (provider === "google_drive") {
    return {
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      scopes: [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
    };
  }
  if (provider === "dropbox") {
    return {
      authorizationEndpoint: "https://www.dropbox.com/oauth2/authorize",
      tokenEndpoint: "https://api.dropboxapi.com/oauth2/token",
      scopes: ["account_info.read", "files.metadata.read", "files.content.read"],
    };
  }
  if (provider === "onedrive") {
    return {
      authorizationEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: ["offline_access", "User.Read", "Files.ReadWrite"],
    };
  }
  return {
    authorizationEndpoint: "https://account.box.com/api/oauth2/authorize",
    tokenEndpoint: "https://api.box.com/oauth2/token",
    scopes: [] as string[],
  };
}

export async function integrationConfig(provider: CloudIntegrationProvider, organizationId: string): Promise<ProviderConfig | null> {
  const platform = platformProviderCredentials(provider);
  const organization = integrationSecretStorageConfigured()
    ? await organizationProviderCredentials(organizationId, provider)
    : null;

  const organizationPair = trimmed(organization?.clientId) && trimmed(organization?.clientSecret)
    ? { clientId: trimmed(organization?.clientId)!, clientSecret: trimmed(organization?.clientSecret)!, credentialSource: "organization" as const }
    : null;
  const platformPair = trimmed(platform.clientId) && trimmed(platform.clientSecret)
    ? { clientId: trimmed(platform.clientId)!, clientSecret: trimmed(platform.clientSecret)!, credentialSource: "platform" as const }
    : null;
  const pair = organizationPair || platformPair;
  if (!pair) return null;

  const endpoints = providerOAuthEndpoints(provider);
  return {
    provider,
    clientId: pair.clientId,
    clientSecret: pair.clientSecret,
    ...endpoints,
    credentialSource: pair.credentialSource,
    credentialFingerprint: credentialFingerprint(provider, pair.clientId, pair.clientSecret),
  };
}

export async function googleDriveApiKeyForOrganization(organizationId: string) {
  if (integrationSecretStorageConfigured()) {
    const organization = await organizationProviderCredentials(organizationId, "google_drive");
    const custom = trimmed(organization?.apiKey);
    if (custom) return custom;
  }
  return trimmed(process.env.GOOGLE_DRIVE_API_KEY);
}

export async function saveOrganizationProviderCredentials(input: {
  organizationId: string;
  accountId: string;
  provider: CloudIntegrationProvider;
  clientId?: unknown;
  clientSecret?: unknown;
  apiKey?: unknown;
}) {
  if (!integrationSecretStorageConfigured()) {
    throw new HttpError(503, "INTEGRATION_SECRET_KEY_REQUIRED", "PHOTO_INTEGRATION_SECRET_KEY must be configured before organization credentials can be saved.");
  }

  const clientId = checkedCredential(input.clientId, "Client ID", 1024);
  const clientSecret = checkedCredential(input.clientSecret, "Client secret");
  const apiKey = input.provider === "google_drive" ? checkedCredential(input.apiKey, "API key") : null;

  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new HttpError(400, "INTEGRATION_OAUTH_PAIR_REQUIRED", "Client ID and client secret must be supplied together.");
  }
  if (input.provider !== "google_drive" && (!clientId || !clientSecret)) {
    throw new HttpError(400, "INTEGRATION_OAUTH_PAIR_REQUIRED", `${cloudIntegrationProviderLabel(input.provider)} requires both Client ID and Client Secret.`);
  }
  if (input.provider === "google_drive" && !apiKey && (!clientId || !clientSecret)) {
    throw new HttpError(400, "INTEGRATION_CREDENTIAL_REQUIRED", "Google Drive requires an API key, an OAuth Client ID/Client Secret pair, or both.");
  }

  const payload: ProviderCredentialPayload = {
    clientId,
    clientSecret,
    ...(input.provider === "google_drive" ? { apiKey } : {}),
  };

  await photoDb
    .insert(integrationProviderCredentials)
    .values({
      organizationId: input.organizationId,
      provider: input.provider,
      configuredByAccountId: input.accountId,
      encryptedPayload: encryptJson(payload),
    })
    .onConflictDoUpdate({
      target: [integrationProviderCredentials.organizationId, integrationProviderCredentials.provider],
      set: {
        configuredByAccountId: input.accountId,
        encryptedPayload: encryptJson(payload),
        updatedAt: new Date(),
      },
    });

  return providerCredentialStatus(input.organizationId, input.provider);
}

export async function deleteOrganizationProviderCredentials(organizationId: string, provider: CloudIntegrationProvider) {
  await photoDb
    .delete(integrationProviderCredentials)
    .where(and(
      eq(integrationProviderCredentials.organizationId, organizationId),
      eq(integrationProviderCredentials.provider, provider),
    ));
  return providerCredentialStatus(organizationId, provider);
}

export async function providerCredentialStatus(organizationId: string, provider: CloudIntegrationProvider): Promise<ProviderCredentialStatus> {
  const platform = platformProviderCredentials(provider);
  const organization = integrationSecretStorageConfigured()
    ? await organizationProviderCredentials(organizationId, provider)
    : null;

  const organizationOauth = Boolean(trimmed(organization?.clientId) && trimmed(organization?.clientSecret));
  const platformOauth = Boolean(trimmed(platform.clientId) && trimmed(platform.clientSecret));
  const oauthSource: ProviderCredentialSource = organizationOauth ? "organization" : platformOauth ? "platform" : "none";
  const activeClientId = organizationOauth ? organization?.clientId : platform.clientId;

  const organizationApiKey = provider === "google_drive" ? trimmed(organization?.apiKey) : null;
  const platformApiKey = provider === "google_drive" ? trimmed(platform.apiKey) : null;
  const apiKeySource: ProviderCredentialSource = organizationApiKey ? "organization" : platformApiKey ? "platform" : "none";
  const activeApiKey = organizationApiKey || platformApiKey;

  return {
    configured: integrationSecretStorageConfigured() && (organizationOauth || platformOauth || Boolean(organizationApiKey) || Boolean(platformApiKey)),
    oauthConfigured: integrationSecretStorageConfigured() && (organizationOauth || platformOauth),
    oauthSource,
    organizationConfigured: Boolean(organization && (organizationOauth || organizationApiKey)),
    platformConfigured: Boolean(platformOauth || platformApiKey),
    clientIdHint: credentialHint(activeClientId),
    clientSecretConfigured: organizationOauth || platformOauth,
    apiKeyConfigured: Boolean(activeApiKey),
    apiKeySource,
    apiKeyHint: credentialHint(activeApiKey),
    supportsCustomCredentials: true,
  };
}

export async function providerCredentialConfiguration(organizationId: string) {
  const [googleDrive, dropbox, onedrive, box] = await Promise.all([
    providerCredentialStatus(organizationId, "google_drive"),
    providerCredentialStatus(organizationId, "dropbox"),
    providerCredentialStatus(organizationId, "onedrive"),
    providerCredentialStatus(organizationId, "box"),
  ]);
  return {
    google_drive: googleDrive,
    dropbox,
    onedrive,
    box,
    pcloud: {
      configured: true,
      oauthConfigured: false,
      oauthSource: "none" as const,
      organizationConfigured: false,
      platformConfigured: false,
      clientIdHint: null,
      clientSecretConfigured: false,
      apiKeyConfigured: false,
      apiKeySource: "none" as const,
      apiKeyHint: null,
      supportsCustomCredentials: false,
      connectionMode: "public_link" as const,
    },
    secretStorageConfigured: integrationSecretStorageConfigured(),
  };
}

export function publicOrigin(requestUrl: string) {
  return process.env.PHOTO_PUBLIC_ORIGIN?.trim()?.replace(/\/$/, "") || new URL(requestUrl).origin;
}

export function integrationRedirectUri(provider: CloudIntegrationProvider, requestUrl: string) {
  return `${publicOrigin(requestUrl)}/api/integrations/${provider}/callback`;
}

export async function buildAuthorizationUrl(provider: CloudIntegrationProvider, organizationId: string, requestUrl: string, state: string) {
  const config = await integrationConfig(provider, organizationId);
  if (!config) throw new HttpError(503, "INTEGRATION_PROVIDER_NOT_CONFIGURED", `${cloudIntegrationProviderLabel(provider)} OAuth credentials are not configured for this organization or the platform.`);
  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", integrationRedirectUri(provider, requestUrl));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  if (config.scopes.length) url.searchParams.set("scope", config.scopes.join(" "));
  if (provider === "google_drive") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
  } else if (provider === "dropbox") {
    url.searchParams.set("token_access_type", "offline");
  } else if (provider === "onedrive") {
    url.searchParams.set("prompt", "select_account");
  }
  return url.toString();
}

async function tokenRequest(provider: CloudIntegrationProvider, organizationId: string, body: URLSearchParams, expectedFingerprint?: string | null) {
  const config = await integrationConfig(provider, organizationId);
  if (!config) throw new HttpError(503, "INTEGRATION_PROVIDER_NOT_CONFIGURED", "Provider OAuth credentials are not configured.");
  if (expectedFingerprint && expectedFingerprint !== config.credentialFingerprint) {
    throw new HttpError(409, "INTEGRATION_RECONNECT_REQUIRED", `${cloudIntegrationProviderLabel(provider)} application credentials changed after this account was connected. Reconnect the provider before continuing.`);
  }
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (provider === "dropbox") {
    headers.Authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
  } else {
    body.set("client_id", config.clientId);
    body.set("client_secret", config.clientSecret);
  }
  const response = await fetch(config.tokenEndpoint, { method: "POST", headers, body, cache: "no-store" });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof data.access_token !== "string") {
    const providerMessage = typeof data.error_description === "string" ? data.error_description : typeof data.error === "string" ? data.error : "OAuth token exchange failed.";
    throw new HttpError(502, "INTEGRATION_TOKEN_EXCHANGE_FAILED", providerMessage);
  }
  return { data, config };
}

export async function exchangeAuthorizationCode(provider: CloudIntegrationProvider, organizationId: string, code: string, requestUrl: string) {
  const body = new URLSearchParams({ code, grant_type: "authorization_code", redirect_uri: integrationRedirectUri(provider, requestUrl) });
  const { data, config } = await tokenRequest(provider, organizationId, body);
  return {
    tokenResponse: data,
    credentialFingerprint: config.credentialFingerprint,
    credentialSource: config.credentialSource,
  };
}

async function providerAccount(provider: CloudIntegrationProvider, accessToken: string) {
  if (provider === "google_drive") {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, cache: "no-store" });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new HttpError(502, "INTEGRATION_ACCOUNT_LOOKUP_FAILED", "Google account details could not be loaded.");
    return { accountName: typeof data.name === "string" ? data.name : "Google Drive", accountEmail: typeof data.email === "string" ? data.email : null, externalAccountId: typeof data.id === "string" ? data.id : null };
  }
  if (provider === "dropbox") {
    const response = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
      body: "null",
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new HttpError(502, "INTEGRATION_ACCOUNT_LOOKUP_FAILED", "Dropbox account details could not be loaded.");
    const name = data.name && typeof data.name === "object" ? data.name as Record<string, unknown> : null;
    return { accountName: typeof name?.display_name === "string" ? name.display_name : "Dropbox", accountEmail: typeof data.email === "string" ? data.email : null, externalAccountId: typeof data.account_id === "string" ? data.account_id : null };
  }
  if (provider === "onedrive") {
    const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, cache: "no-store" });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new HttpError(502, "INTEGRATION_ACCOUNT_LOOKUP_FAILED", "Microsoft account details could not be loaded.");
    return {
      accountName: typeof data.displayName === "string" ? data.displayName : "OneDrive",
      accountEmail: typeof data.mail === "string" ? data.mail : typeof data.userPrincipalName === "string" ? data.userPrincipalName : null,
      externalAccountId: typeof data.id === "string" ? data.id : null,
    };
  }
  const response = await fetch("https://api.box.com/2.0/users/me?fields=id,name,login", { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, cache: "no-store" });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new HttpError(502, "INTEGRATION_ACCOUNT_LOOKUP_FAILED", "Box account details could not be loaded.");
  return {
    accountName: typeof data.name === "string" ? data.name : "Box",
    accountEmail: typeof data.login === "string" ? data.login : null,
    externalAccountId: typeof data.id === "string" ? data.id : null,
  };
}

export async function storeOAuthIntegration(input: {
  organizationId: string;
  accountId: string;
  provider: CloudIntegrationProvider;
  tokenResponse: Record<string, unknown>;
  credentialFingerprint: string;
  credentialSource: Exclude<ProviderCredentialSource, "none">;
}) {
  const accessToken = String(input.tokenResponse.access_token || "");
  if (!accessToken) throw new HttpError(502, "INTEGRATION_ACCESS_TOKEN_MISSING", "OAuth provider did not return an access token.");
  const account = await providerAccount(input.provider, accessToken);
  const expiresIn = Number(input.tokenResponse.expires_in || 0);
  const tokens: TokenPayload = {
    accessToken,
    refreshToken: typeof input.tokenResponse.refresh_token === "string" ? input.tokenResponse.refresh_token : null,
    expiresAt: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    tokenType: typeof input.tokenResponse.token_type === "string" ? input.tokenResponse.token_type : null,
    scope: typeof input.tokenResponse.scope === "string" ? input.tokenResponse.scope : null,
    oauthCredentialFingerprint: input.credentialFingerprint,
    oauthCredentialSource: input.credentialSource,
  };
  const [integration] = await photoDb.insert(integrations).values({
    organizationId: input.organizationId,
    connectedByAccountId: input.accountId,
    provider: input.provider,
    secretRef: "db-encrypted",
    accountEmail: account.accountEmail,
    accountName: account.accountName,
    isEnabled: true,
    metadata: { externalAccountId: account.externalAccountId, connectedAt: new Date().toISOString(), scope: tokens.scope, oauthCredentialSource: input.credentialSource },
  }).onConflictDoUpdate({
    target: [integrations.organizationId, integrations.provider],
    set: {
      connectedByAccountId: input.accountId,
      secretRef: "db-encrypted",
      accountEmail: account.accountEmail,
      accountName: account.accountName,
      isEnabled: true,
      metadata: { externalAccountId: account.externalAccountId, connectedAt: new Date().toISOString(), scope: tokens.scope, oauthCredentialSource: input.credentialSource },
      updatedAt: new Date(),
    },
  }).returning();
  await photoDb.insert(integrationSecrets).values({ integrationId: integration.id, encryptedPayload: encryptJson(tokens) })
    .onConflictDoUpdate({ target: integrationSecrets.integrationId, set: { encryptedPayload: encryptJson(tokens), updatedAt: new Date() } });
  return integration;
}

async function readTokens(integrationId: string) {
  const [row] = await photoDb.select().from(integrationSecrets).where(eq(integrationSecrets.integrationId, integrationId)).limit(1);
  if (!row) throw new HttpError(409, "INTEGRATION_CREDENTIALS_MISSING", "Integration credentials are missing. Reconnect the provider.");
  return decryptJson<TokenPayload>(row.encryptedPayload);
}

async function refreshTokens(provider: CloudIntegrationProvider, integrationId: string, tokens: TokenPayload) {
  if (!tokens.refreshToken) return tokens;
  const [integration] = await photoDb.select({ organizationId: integrations.organizationId }).from(integrations).where(eq(integrations.id, integrationId)).limit(1);
  if (!integration) throw new HttpError(404, "INTEGRATION_NOT_CONNECTED", "Provider is not connected.");
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refreshToken });
  const { data, config } = await tokenRequest(provider, integration.organizationId, body, tokens.oauthCredentialFingerprint);
  const expiresIn = Number(data.expires_in || 0);
  const next: TokenPayload = {
    accessToken: String(data.access_token),
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : tokens.refreshToken,
    expiresAt: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : tokens.expiresAt,
    tokenType: typeof data.token_type === "string" ? data.token_type : tokens.tokenType,
    scope: typeof data.scope === "string" ? data.scope : tokens.scope,
    oauthCredentialFingerprint: config.credentialFingerprint,
    oauthCredentialSource: config.credentialSource,
  };
  await photoDb.update(integrationSecrets).set({ encryptedPayload: encryptJson(next), updatedAt: new Date() }).where(eq(integrationSecrets.integrationId, integrationId));
  return next;
}

export async function integrationAccessToken(provider: CloudIntegrationProvider, integrationId: string) {
  let tokens = await readTokens(integrationId);
  const expiresAt = tokens.expiresAt ? new Date(tokens.expiresAt).getTime() : 0;
  if (expiresAt && expiresAt < Date.now() + 120_000) tokens = await refreshTokens(provider, integrationId, tokens);
  return tokens.accessToken;
}

export async function testIntegrationConnection(provider: CloudIntegrationProvider, integrationId: string) {
  const accessToken = await integrationAccessToken(provider, integrationId);
  if (provider === "google_drive") {
    const response = await fetch("https://www.googleapis.com/drive/v3/about?fields=user,storageQuota", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    if (!response.ok) throw new HttpError(502, "INTEGRATION_TEST_FAILED", "Google Drive connection test failed. Reconnect the provider if access was revoked.");
    const data = await response.json() as Record<string, unknown>;
    return { ok: true, provider, checkedAt: new Date().toISOString(), details: data };
  }
  if (provider === "dropbox") {
    const response = await fetch("https://api.dropboxapi.com/2/users/get_current_account", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: "null", cache: "no-store" });
    if (!response.ok) throw new HttpError(502, "INTEGRATION_TEST_FAILED", "Dropbox connection test failed. Reconnect the provider if access was revoked.");
    const data = await response.json() as Record<string, unknown>;
    return { ok: true, provider, checkedAt: new Date().toISOString(), details: { accountId: data.account_id, email: data.email } };
  }
  if (provider === "onedrive") {
    const response = await fetch("https://graph.microsoft.com/v1.0/me/drive?$select=id,driveType,quota", { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new HttpError(502, "INTEGRATION_TEST_FAILED", "OneDrive connection test failed. Reconnect the provider if access was revoked.");
    const data = await response.json() as Record<string, unknown>;
    return { ok: true, provider, checkedAt: new Date().toISOString(), details: data };
  }
  const response = await fetch("https://api.box.com/2.0/users/me?fields=id,name,login", { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new HttpError(502, "INTEGRATION_TEST_FAILED", "Box connection test failed. Reconnect the provider if access was revoked.");
  const data = await response.json() as Record<string, unknown>;
  return { ok: true, provider, checkedAt: new Date().toISOString(), details: { id: data.id, login: data.login } };
}
