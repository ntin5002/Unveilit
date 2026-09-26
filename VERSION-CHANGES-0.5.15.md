# Photo Delivery 0.5.15 — Organization Provider Credentials

## Summary

0.5.15 adds organization-configurable provider application credentials to the existing **Integrations** and **Link Import** architecture. Provider app credentials are no longer limited to deployment environment variables: an authorized organization can securely save its own credentials from the website while the platform keeps environment variables as the fallback.

The existing `CloudImportHandler` contract is preserved. Google Drive Import, Dropbox Import, OneDrive Import, Box Import, and pCloud Import continue to converge on the same private ORIGINAL ingest and Photo Worker path.

## Credential architecture

The provider credential resolution order is now:

```text
Link Import / OAuth connection
        |
        v
Organization Provider Credential Resolver
        |
        +--> organization-scoped encrypted credentials
        |       |
        |       +--> Google Drive OAuth Client ID / Client Secret
        |       +--> Google Drive API Key
        |       +--> Dropbox Client ID / Client Secret
        |       +--> OneDrive Client ID / Client Secret
        |       +--> Box Client ID / Client Secret
        |
        +--> platform environment fallback
        |       |
        |       +--> GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET
        |       +--> GOOGLE_DRIVE_API_KEY
        |       +--> DROPBOX_CLIENT_ID / DROPBOX_CLIENT_SECRET
        |       +--> ONEDRIVE_CLIENT_ID / ONEDRIVE_CLIENT_SECRET
        |       +--> BOX_CLIENT_ID / BOX_CLIENT_SECRET
        |
        +--> credential-free public-link path where the provider supports it
                |
                +--> Google Drive public links
                +--> Dropbox public single-file links
                +--> pCloud public links
```

Organization values override platform fallback values only for the relevant credential set. For Google Drive, the OAuth Client ID/Client Secret pair and the API key are resolved independently, so an organization can provide only its own Drive API key while still using the platform OAuth application.

## Secure storage boundary

New Photo-owned table:

- `integration_provider_credentials`

Each record is scoped by:

- `organization_id`
- `provider`
- `configured_by_account_id`

The credential payload is encrypted server-side with AES-256-GCM through the existing `PHOTO_INTEGRATION_SECRET_KEY` encryption boundary. The database never stores provider Client Secrets or API keys as plaintext.

Provider application credentials are deliberately separate from `integration_secrets`:

- `integration_provider_credentials` stores the organization's provider **application configuration**.
- `integration_secrets` continues to store encrypted provider **OAuth access/refresh tokens** for a connected account.

This separation allows credentials to exist before an account is connected and prevents application secrets from being mixed with account authorization tokens.

## Browser/API secrecy rules

The Integrations UI can save or remove organization credentials, but the API never returns saved secrets to the browser.

Safe status data may include:

- whether OAuth credentials exist;
- whether a Google Drive API key exists;
- whether the active source is `organization`, `platform`, or `none`;
- a masked Client ID hint;
- a masked API-key hint.

The API does **not** return:

- Client Secret values;
- full API keys;
- OAuth access tokens;
- OAuth refresh tokens;
- encrypted database payloads;
- `PHOTO_INTEGRATION_SECRET_KEY`.

Credential updates/removals are written to the Photo product audit log without including secret values.

## OAuth credential consistency / rotation safety

OAuth refresh tokens are tied to the provider application that issued them. 0.5.15 therefore records an internal SHA-256 fingerprint of the OAuth Client ID + Client Secret pair used when an integration is connected.

When a refresh is needed:

1. Photo Delivery resolves the current organization/platform OAuth app credentials.
2. The resolver compares the current credential fingerprint with the fingerprint stored inside the encrypted token payload.
3. If the application credentials changed, token refresh is rejected with `INTEGRATION_RECONNECT_REQUIRED`.
4. The user reconnects the provider using the new application credentials.

The fingerprint is not a replacement for encryption and is never used as an authentication secret. Its purpose is only to detect app-credential rotation before a provider returns confusing refresh-token failures.

The OAuth code exchange also carries the exact credential fingerprint/source forward into token storage instead of resolving the provider configuration a second time. This closes the narrow rotation race where another administrator could replace organization credentials between code exchange and encrypted token persistence.


Connections created before 0.5.15 do not contain a fingerprint. They remain backward compatible and acquire the current fingerprint the next time a successful refresh is performed.

## Organization binding during OAuth

The OAuth start flow now binds the state cookie to the active organization ID. The callback verifies that the active organization has not changed before exchanging the authorization code.

This prevents an OAuth flow started for Organization A from being completed into Organization B after an organization switch in another tab/session action.

## Provider coverage

| Provider | Organization-configurable credentials | Platform fallback | Credential-free Link Import |
| --- | --- | --- | --- |
| Google Drive Import | OAuth Client ID + Client Secret; optional API Key | Yes | Public shared links when Drive exposes them |
| Dropbox Import | OAuth Client ID + Client Secret | Yes | Public single-file links |
| OneDrive Import | Client ID + Client Secret | Yes | No — current Graph share resolution requires authenticated access |
| Box Import | Client ID + Client Secret | Yes | No — current Shared Item API path requires authenticated access |
| pCloud Import | Not required by current public-link handler | Not required | Yes |

pCloud is explicitly represented in the Integrations UI as **No credentials required**. If authenticated pCloud import is added later, it should use this same organization credential resolver rather than introduce a parallel secret store.

## Integrations UI

`Dashboard → Integrations` now exposes **Configure credentials** for Google Drive, Dropbox, OneDrive, and Box.

The UI shows:

- active OAuth credential source;
- masked Client ID hint;
- Google Drive API-key source/hint;
- whether custom organization credentials exist;
- platform fallback status;
- existing account connection status.

Actions:

- **Save securely** — replaces the active organization's custom credential set.
- **Use platform fallback** — deletes only the organization custom credential row; platform environment credentials remain untouched.
- **Connect / Reconnect** — continues through provider OAuth using the resolved organization/platform app credentials.
- **Disconnect** — removes the connected account OAuth authorization but intentionally keeps organization application credentials until they are removed separately.

## Google Drive API-key resolution

`GoogleDriveCloudImportHandler` no longer reads `GOOGLE_DRIVE_API_KEY` directly.

It now requests the key from the organization-aware credential resolver:

```text
organization Google Drive API key
        -> platform GOOGLE_DRIVE_API_KEY
        -> anonymous public-link attempt
```

This makes website-configured Google Drive API keys apply to Link Import without exposing them to the browser or worker logs.

## Platform environment variables

The existing variables remain supported and now mean **platform fallback credentials**:

```env
PHOTO_INTEGRATION_SECRET_KEY=

GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_API_KEY=

DROPBOX_CLIENT_ID=
DROPBOX_CLIENT_SECRET=

ONEDRIVE_CLIENT_ID=
ONEDRIVE_CLIENT_SECRET=

BOX_CLIENT_ID=
BOX_CLIENT_SECRET=
```

`PHOTO_INTEGRATION_SECRET_KEY` remains required in production for encrypted organization credentials and encrypted OAuth token storage.

The key must remain stable across deployments. Rotating it requires a deliberate credential re-encryption/reconnection migration; simply changing the environment value would make existing encrypted provider credentials and OAuth tokens unreadable.

## What is intentionally not organization-configurable

This release applies the website credential system to **cloud import provider application credentials**. Infrastructure/operator secrets remain deployment-owned and are intentionally not exposed as client-configurable settings, including:

- R2/S3 storage credentials;
- Photo media/forensic signing secrets;
- database URLs;
- Stripe platform secret/webhook credentials;
- Signative integration webhook secrets.

Those values control platform infrastructure or trust boundaries rather than a client's cloud-import application.

## Database

Production Photo DB migration:

```text
drizzle/0.5.15-organization-provider-credentials.sql
```

Adds:

```text
integration_provider_credentials
```

No Platform Core database migration is required. No Signative database migration is required.

## Authorization

Credential configuration continues to use the existing server-authoritative `photos.settings.manage` capability gate. Organization isolation is enforced with the active Platform Core organization ID on every credential lookup/write/delete.

No secret value is accepted from or returned to public gallery routes.

## Preserved Link Import architecture

All import providers still use:

```text
shared provider link
  -> CloudImportHandler
  -> organization-aware credential resolver when required
  -> durable Link Import job/items
  -> server-side remote download
  -> private ORIGINAL storage
  -> Photo Worker
  -> PREVIEW / WATERMARKED_PREVIEW / THUMBNAIL
  -> existing proofing / delivery / theft-prevention pipeline
```

Remote cloud links never become permanent gallery asset URLs, and provider credentials never enter photo asset metadata.
