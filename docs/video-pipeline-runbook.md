# Video Pipeline Runbook

End-to-end video support: browser → S3 multipart upload → AWS Elemental
MediaConvert (adaptive HLS + poster frame) → EventBridge completion handler →
HLS playback (hls.js / native Safari).

Video is **enabled by default for S3-backed deployments** and remains S3-only.
Set `VIDEO_ENABLED=false` (server) and `NEXT_PUBLIC_VIDEO_ENABLED=false`
(client) to opt out. Filesystem/local storage stays image-only by default.

## Architecture

```
Browser (multipart PUT to S3)                 EventBridge (job state change)
  create -> presign parts -> complete                   |
        |                                               v
/api/admin/upload/video/{create,complete,abort}   video-complete Lambda (Sharp)
        | CompleteMultipartUpload                  - poster JPG -> {w}w.webp/avif
        | save Photo{processing, video}            - blurDataUrl, width/height, durationMs
        | MediaConvert CreateJob (UserMetadata)    - UpdateItem status: ready | error
        v                                               v
S3 processed/{id}/hls/master.m3u8 + poster      CloudFront serves HLS + poster
```

HLS and poster derivatives are written under `processed/{photoId}/` so they are
served by the same CloudFront/OAC origin and cleaned up by the existing
`deletePhotoFiles()` cascade. Posters are emitted as standard
`{width}w.webp/avif` derivatives, so all existing image-display code renders
video thumbnails unchanged.

## Deployment Prerequisites

### 1. Provision infrastructure (CDK)

Deploy normally so the MediaConvert role, completion Lambda, EventBridge rule,
and IAM grants are created by default:

```bash
cd photo-profile-cdk
npx cdk deploy -c s3BucketName=<bucket> -c dynamodbTablePrefix=<prefix>
```

The app derives the default MediaConvert role ARN from AWS STS at runtime. Record
the stack output `MediaConvertRoleArn` only if you want to set an explicit
`AWS_MEDIACONVERT_ROLE_ARN` override.
To deploy image-only infrastructure, pass `-c VIDEO_ENABLED=false`.

The CDK CloudFront distribution uses the managed
`CORS_ALLOW_ALL_ORIGINS` response headers policy so hls.js can fetch HLS
manifests and segments from the CDN when the app is served from a different
origin.

### 2. S3 bucket CORS (required, manual)

The bucket is referenced via `fromBucketName` (not created by CDK), so its CORS
configuration is **not** managed by this stack. Browser-driven multipart upload
PUTs each part cross-origin and reads the returned `ETag` header to finalize the
upload. The bucket CORS **must expose `ETag`**, or every video upload fails on
the first part with `Missing ETag in S3 response (bucket CORS must expose the
ETag header)`.

Apply a CORS configuration like:

```json
[
  {
    "AllowedOrigins": ["https://your-app-domain.example.com"],
    "AllowedMethods": ["PUT", "POST", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

```bash
aws s3api put-bucket-cors --bucket <bucket> --cors-configuration file://cors.json
```

### 3. Environment variables

Server (Vercel):

| Name                        | Value                                                |
| --------------------------- | ---------------------------------------------------- |
| `VIDEO_ENABLED`             | Optional; omit or set `true`. Set `false` to opt out |
| `STORAGE_BACKEND`           | `s3` (required when video is enabled)                |
| `AWS_MEDIACONVERT_ROLE_ARN` | Optional override; omit to use the CDK default role  |
| `AWS_CLOUDFRONT_DOMAIN`     | CDK output `CloudFrontDomain`                        |
| `AWS_MEDIACONVERT_ENDPOINT` | Optional; omit to use the default regional endpoint  |

Client (Vercel, inlined at build time):

| Name                            | Value                                                |
| ------------------------------- | ---------------------------------------------------- |
| `NEXT_PUBLIC_STORAGE_BACKEND`   | `s3`                                                 |
| `NEXT_PUBLIC_VIDEO_ENABLED`     | Optional; omit or set `true`. Set `false` to opt out |
| `NEXT_PUBLIC_CLOUDFRONT_DOMAIN` | Same domain as `AWS_CLOUDFRONT_DOMAIN`               |

`env.ts` fails fast at startup when video is enabled without
`STORAGE_BACKEND=s3` and `AWS_CLOUDFRONT_DOMAIN`.

## Limits and Settings

- Max video size: 2GB (`MAX_VIDEO_FILE_SIZE`), uploaded via 64MB multipart parts.
- Video multipart presigned part URLs expire after 6 hours
  (`VIDEO_MULTIPART_PRESIGN_EXPIRY_SECONDS`).
- Accepted inputs: `video/mp4`, `video/quicktime` (.mov), `video/webm`.
- HLS: Automated ABR ladder capped at the source resolution (no upscaling),
  6s TS segments, AAC 128k audio. Master playlist at
  `processed/{id}/hls/master.m3u8`.
- Poster: a single full-resolution frame capture, converted to the standard
  derivative set by the completion handler.

## Operational Notes

- **Stuck in `processing`**: a `CreateJob` failure (e.g. transient MediaConvert
  error) leaves the photo `processing`. `findStaleProcessing` surfaces these;
  re-run via `POST /api/admin/photos/{id}/reprocess`, which re-submits the
  MediaConvert job for video records (and re-enqueues SQS for images).
- **`error` status**: the completion handler marks `error` on MediaConvert
  `ERROR` events or when no poster frame is produced. Reprocess to retry.
- **Playback unavailable**: video requires CloudFront. If
  `NEXT_PUBLIC_CLOUDFRONT_DOMAIN` is unset, `getVideoManifestUrl` returns null
  and the lightbox falls back to the poster image.
- **Deletion**: `deletePhotoFiles()` removes `originals/{id}` and
  `processed/{id}` (including `hls/` and `poster/`), so no extra cleanup is
  needed for video.

## Evidence Hygiene

When capturing logs or CDK output for tickets, redact access keys, session
cookies, account IDs, and presigned URLs.
