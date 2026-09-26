# Upload System Repair — 0.4.9

## Architecture

```text
Browser queue
  | preflight type / size / duplicate
  v
POST /api/uploads/intents
  | creates photo + ORIGINAL asset + upload session
  | returns short-lived signed PUT / local bearer PUT
  v
PRIVATE STAGING OBJECT
  | XHR direct PUT; progress/speed/ETA stays in browser
  v
POST /api/uploads/complete
  | token + account + gallery checks
  | HEAD/stat size/type verification
  | staging -> immutable private original promotion
  | queues PROCESS_ORIGINAL
  v
PHOTO WORKER
  | durable PostgreSQL job + lease/heartbeat
  | preview / protected preview / thumbnail
  v
READY
```

The final original key is never the browser upload target. Reusing an unexpired signed PUT can only replace the staging object; completion promotes a verified object to the private final key.

## Browser state model

| State | Meaning | Client action |
|---|---|---|
| `QUEUED` | Passed preflight; waiting for a concurrency slot | pause/cancel |
| `UPLOADING` | Browser is PUTing original to private staging | progress/cancel/pause |
| `UPLOADED` | PUT finished; completion/verification has not finished | status recovery |
| `VERIFYING` | Server validates staging object and promotes original | poll only |
| `PROCESSING` | Durable worker job owns image processing | poll/retry after terminal failure |
| `READY` | Protected derivative available | terminal success |
| `FAILED` | Recoverable or terminal failure | retry if supported |
| `CANCELLED` | Queue/upload was cancelled before worker processing | may requeue the local File if still present |

## Concurrency

`PHOTO_UPLOAD_BROWSER_CONCURRENCY` defaults to 4 and is clamped to 3–6. Upload intents are created only when a file enters an active queue slot rather than for the entire selected batch at once.

## Pause / reconnect semantics

0.4.9 intentionally uses **single PUT** uploads. Therefore:

- pausing/offline during an active PUT aborts that transfer;
- resume reuses the same still-valid staging intent and restarts that file from 0%;
- a file whose PUT already completed is not re-sent just because completion/verification response was interrupted;
- server status is checked first, and verification can be retried independently.

Multipart upload with byte/part resume remains a future large-file feature.

## Duplicate checks

Two layers are used:

1. client queue fingerprint: lowercased filename + size;
2. server same-gallery check: original filename + size against non-cancelled/non-failed photos.

The second layer can be bypassed only through the explicit **Upload anyway** action. This protects accidental duplicate batches without blocking intentional duplicates.

## Cancellation safety

Cancellation is allowed before verification/processing becomes active. For queued worker jobs, the server changes `photo_processing_jobs.status` from pending/failed to cancelled in the same database transaction as the upload/photo cancellation. This prevents a worker claim from racing the cancellation. Storage cleanup is best-effort after the database transition.

## Worker observability

`photo_processing_jobs` exposes `stage`, `progress_percent`, `started_at`, `last_heartbeat_at`, `worker_version`, `failed_at`, attempt count, and last error. The worker continues to use `FOR UPDATE SKIP LOCKED`, a renewable lease, stale-lock reclaim, and exponential retry.

The UI maps these internals to `PROCESSING` with a stage label rather than exposing storage details to the user.

## Recovery behavior

- Network/XHR failure: file becomes retryable; unchanged valid intent may be reused.
- Completion response lost: query `/api/uploads`; if processing/ready already happened, adopt server state; otherwise retry verification without re-upload.
- Worker retryable error: worker moves job to `RETRY_WAIT` and retries automatically.
- Worker terminal error: UI exposes retry when the original asset is still valid.
- Expired staging intent: stale upload session is cancelled/cleaned and a fresh intent is created.

## Database migration

Use `npm run db:push:photo` in normal development, or review/apply `drizzle/0.4.9-upload-system-repair.sql` in controlled production migration workflows.
