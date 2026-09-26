# Private R2 Upload + Photo Worker

This implementation keeps all originals and generated assets private. The browser never receives R2 credentials and never uploads through the Next.js server in production.

## Production flow

```text
Browser
  -> POST /api/uploads/intents
  <- short-lived presigned PUT + completion token
  -> PUT original directly to R2 staging key
       -> XHR reports per-file progress/speed/ETA
       -> browser queue limits active transfers (default 4)
  -> POST /api/uploads/complete
       -> server HEAD verifies size/type
       -> server CopyObject promotes staging -> final private original key
       -> server queues PROCESS_ORIGINAL job
  -> GET /api/uploads?ids=... reports verification + worker stage
  -> Photo Worker
       -> downloads final original to a temp file
       -> auto-orients and validates image
       -> writes private PREVIEW
       -> writes private WATERMARKED_PREVIEW
       -> writes private THUMBNAIL
       -> updates photo_assets + photo state
```

The signed browser PUT points to `staging/uploads/<uploadId>/...`, never the final original key. R2 presigned PUT URLs can be reused until they expire, so the completion endpoint copies the verified staging object to a separate final key using the observed source ETag as a copy precondition. Replaying the browser PUT can therefore only recreate the staging object, not overwrite the final original.

## R2 setup

Create one **private** R2 bucket. Do not enable public bucket access for originals or previews.

Create an R2 S3 API token with Object Read & Write access limited to that bucket, then configure:

```env
PHOTO_STORAGE_DRIVER=r2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=photo-delivery-private
```

Recommended CORS policy for the production Photo Delivery web origin:

```json
[
  {
    "AllowedOrigins": ["https://photos.example.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type", "Cache-Control"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

For local testing against real R2, also add `http://localhost:3000` as an allowed origin.

The current single-PUT implementation intentionally caps originals at 100 MiB by default. This is appropriate for normal edited photography files. 0.4.9 provides queue-level pause/reconnect recovery, but an interrupted active PUT restarts that file from byte 0. Add multipart upload later if the product needs very large RAW/video files or exact byte/part resume.

## Staging lifecycle

The Photo Worker deletes expired staging objects recorded in `photo_uploads`. For defense in depth, also configure an R2 lifecycle rule to delete objects under `staging/uploads/` after a short period such as one day. The final originals live under organization/gallery/photo prefixes and are not affected by that staging rule.

## Worker

Run independently from Next.js:

```bash
npm run worker
```

For local `.env.local`:

```bash
npm run worker:local
```

The worker uses PostgreSQL as a durable queue. It claims jobs with `FOR UPDATE SKIP LOCKED`, renews its lock while processing, retries transient failures with backoff, and reclaims stale locks after the configured timeout. Multiple worker processes can run safely. 0.4.9 also records stage, percent progress, start/heartbeat/failure timestamps, attempt limits, and worker version so upload UI recovery can distinguish queueing, active processing, retry wait, terminal failure, and completion.

Generated assets:

- `ORIGINAL` — uploaded edited original, unchanged and private.
- `PREVIEW` — fitted to the gallery proof long edge (1500 or 2048 px), unwatermarked and private.
- `WATERMARKED_PREVIEW` — fitted to the gallery proof long edge (1500 or 2048 px), worker-baked watermark + forensic TRACE, used for public proofing.
- `THUMBNAIL` — max 640 px, also worker-watermarked/traced to avoid fallback leakage.

Generated JPEG previews strip original EXIF payloads by default. Only a small safe metadata summary is stored in the Photo database.

## Worker controls

```env
PHOTO_WORKER_CONCURRENCY=2
PHOTO_WORKER_POLL_MS=1500
PHOTO_WORKER_LOCK_TIMEOUT_MINUTES=15
PHOTO_WORKER_MAX_ATTEMPTS=3
PHOTO_WORKER_VERSION=0.4.9
PHOTO_UPLOAD_BROWSER_CONCURRENCY=4
PHOTO_WORKER_MAX_PIXELS=150000000
PHOTO_THUMBNAIL_MAX_DIMENSION=640
PHOTO_WATERMARK_TEXT=PROOF
PHOTO_MEDIA_SESSION_SECRET=<strong-random-secret>
PHOTO_MEDIA_SESSION_TTL_SECONDS=600
PHOTO_FORENSIC_SECRET=<different-strong-random-secret>
```

`PHOTO_WORKER_MAX_PIXELS` protects the worker from decompression/pixel-bomb inputs. The original file remains untouched if processing fails. The worker also compares Sharp’s decoded format with the declared MIME type before generating derivatives, so a renamed/non-image payload cannot quietly enter the ready state.

## Local storage mode

Local testing does not require Cloudflare:

```env
PHOTO_STORAGE_DRIVER=local
PHOTO_LOCAL_STORAGE_PATH=.local-storage/photo-delivery
```

The same upload/session/queue/worker flow is used, but bytes are stored in the ignored `.local-storage` directory. The local upload endpoint exists only for this development driver; `PHOTO_STORAGE_DRIVER=local` is rejected in production.

## Authorization rules

- Creating an upload requires `photos.photos.upload` plus gallery manage authority.
- Completion is bound to the account that requested the upload intent.
- Public asset routes can return only `WATERMARKED_PREVIEW` and `THUMBNAIL`.
- Staff access to `ORIGINAL` through the generic asset route requires `photos.storage.manage`.
- Paid-client original delivery should continue to use the Gallery Entitlement flow rather than weakening these storage rules.


## 0.4.9 upload recovery endpoints

- `GET /api/uploads/intents` — current MIME/size/concurrency constraints for client preflight.
- `POST /api/uploads/intents` — creates a private staging session only when a queue slot opens.
- `POST /api/uploads/complete` — verifies and promotes the staged object, then queues the worker.
- `GET /api/uploads?ids=<id,...>` — combined upload/photo/worker status used for recovery and progress.
- `DELETE /api/uploads/<id>` — safe cancellation before active verification/worker processing.
- `POST /api/uploads/<id>` with `{ "action": "retry_processing" }` — requeues a terminal worker failure when the verified original still exists.

Cancellation of a pending worker job is transactionally coordinated with the upload/photo state change, preventing a worker-claim race.
