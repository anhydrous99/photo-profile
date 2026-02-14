#!/usr/bin/env bash
# Configure S3 bucket CORS for direct browser uploads via presigned URLs.
# Required for STORAGE_BACKEND=s3 when deploying to Vercel.
#
# Usage: ./scripts/configure-s3-cors.sh <bucket-name> <allowed-origin>
# Example: ./scripts/configure-s3-cors.sh my-photo-bucket https://mysite.vercel.app
#
# For local development, also add http://localhost:3000:
#   ./scripts/configure-s3-cors.sh my-photo-bucket http://localhost:3000

set -euo pipefail

BUCKET_NAME="${1:?Usage: $0 <bucket-name> <allowed-origin>}"
ALLOWED_ORIGIN="${2:?Usage: $0 <bucket-name> <allowed-origin>}"

CORS_CONFIG=$(cat <<EOF
{
  "CORSRules": [
    {
      "AllowedOrigins": ["${ALLOWED_ORIGIN}"],
      "AllowedMethods": ["PUT"],
      "AllowedHeaders": ["Content-Type"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
}
EOF
)

echo "Applying CORS configuration to bucket: ${BUCKET_NAME}"
echo "${CORS_CONFIG}" | aws s3api put-bucket-cors \
  --bucket "${BUCKET_NAME}" \
  --cors-configuration file:///dev/stdin

echo "Verifying CORS configuration..."
aws s3api get-bucket-cors --bucket "${BUCKET_NAME}"
echo "Done."
