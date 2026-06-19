#!/usr/bin/env bash
set -euo pipefail

# Lambda packaging script
# Bundles the SQS image handler and the EventBridge video-completion handler
# with esbuild and installs Sharp for ARM64 Linux.
# Output: lambda-package/ ready for CDK lambda.Code.fromAsset()

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LAMBDA_DIR="${PROJECT_ROOT}/lambda-package"
HANDLER_ENTRY="src/infrastructure/jobs/lambdaHandler.ts"
HANDLER_OUT="src/infrastructure/jobs/lambdaHandler.js"
VIDEO_HANDLER_ENTRY="src/infrastructure/jobs/videoCompleteHandler.ts"
VIDEO_HANDLER_OUT="src/infrastructure/jobs/videoCompleteHandler.js"
SHARP_VERSION="0.34.5"
SHARP_LIBVIPS_VERSION="1.2.4"
LAMBDA_SIZE_LIMIT_MB=250

echo "=== Lambda Build Script ==="
echo "Project root: ${PROJECT_ROOT}"
echo ""

# ── Step 1: Clean lambda-package/ (preserve .gitkeep) ──────────────────────
echo "→ Cleaning lambda-package/ directory..."
find "${LAMBDA_DIR}" -mindepth 1 ! -name '.gitkeep' -delete 2>/dev/null || true
echo "  Done."
echo ""

# ── Step 2: Bundle with esbuild ────────────────────────────────────────────
echo "→ Bundling ${HANDLER_ENTRY} with esbuild..."
npx esbuild "${PROJECT_ROOT}/${HANDLER_ENTRY}" \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile="${LAMBDA_DIR}/${HANDLER_OUT}" \
  --external:sharp \
  --alias:@="${PROJECT_ROOT}/src"

echo "  Bundle created: ${LAMBDA_DIR}/${HANDLER_OUT}"

echo "→ Bundling ${VIDEO_HANDLER_ENTRY} with esbuild..."
npx esbuild "${PROJECT_ROOT}/${VIDEO_HANDLER_ENTRY}" \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile="${LAMBDA_DIR}/${VIDEO_HANDLER_OUT}" \
  --external:sharp \
  --alias:@="${PROJECT_ROOT}/src"

echo "  Bundle created: ${LAMBDA_DIR}/${VIDEO_HANDLER_OUT}"
echo ""

# ── Step 3: Install Sharp for ARM64 Linux ──────────────────────────────────
echo "→ Installing Sharp ${SHARP_VERSION} for ARM64 Linux..."
cd "${LAMBDA_DIR}"
npm init -y --silent > /dev/null 2>&1
npm install "sharp@${SHARP_VERSION}" --silent 2>&1
# npm won't install cross-platform optional deps, so force-install ARM64 Linux
# native binaries pinned to the versions required by sharp.
npm install --force \
  "@img/sharp-linux-arm64@${SHARP_VERSION}" \
  "@img/sharp-libvips-linux-arm64@${SHARP_LIBVIPS_VERSION}" \
  --silent 2>&1
# Remove host platform binaries (not needed in Lambda)
rm -rf "${LAMBDA_DIR}/node_modules/@img/sharp-darwin-arm64" \
       "${LAMBDA_DIR}/node_modules/@img/sharp-darwin-x64" \
       "${LAMBDA_DIR}/node_modules/@img/sharp-libvips-darwin-arm64" \
       "${LAMBDA_DIR}/node_modules/@img/sharp-libvips-darwin-x64" \
       "${LAMBDA_DIR}/node_modules/@img/sharp-win32-"* \
       "${LAMBDA_DIR}/node_modules/@img/sharp-wasm32" 2>/dev/null || true

echo "  Sharp installed."
echo ""

# ── Step 4: Verify output ─────────────────────────────────────────────────
echo "→ Verifying output..."

# Check handler file exists
if [ ! -f "${LAMBDA_DIR}/${HANDLER_OUT}" ]; then
  echo "  ERROR: Handler file not found: ${LAMBDA_DIR}/${HANDLER_OUT}"
  exit 1
fi
echo "  ✓ Handler file exists"

if [ ! -f "${LAMBDA_DIR}/${VIDEO_HANDLER_OUT}" ]; then
  echo "  ERROR: Video handler file not found: ${LAMBDA_DIR}/${VIDEO_HANDLER_OUT}"
  exit 1
fi
echo "  ✓ Video handler file exists"

# Check Sharp is installed
if [ ! -d "${LAMBDA_DIR}/node_modules/sharp" ]; then
  echo "  ERROR: Sharp not found in node_modules"
  exit 1
fi
echo "  ✓ Sharp installed in node_modules"

# Check package size
PACKAGE_SIZE_KB=$(du -sk "${LAMBDA_DIR}" | awk '{print $1}')
PACKAGE_SIZE_MB=$((PACKAGE_SIZE_KB / 1024))
echo "  ✓ Package size: ${PACKAGE_SIZE_MB}MB"

if [ "${PACKAGE_SIZE_MB}" -ge "${LAMBDA_SIZE_LIMIT_MB}" ]; then
  echo "  ERROR: Package size ${PACKAGE_SIZE_MB}MB exceeds Lambda limit of ${LAMBDA_SIZE_LIMIT_MB}MB"
  exit 1
fi
echo "  ✓ Under ${LAMBDA_SIZE_LIMIT_MB}MB Lambda limit"

echo ""
echo "=== Lambda build complete ==="
echo "Image handler: ${HANDLER_OUT} (exports 'handler')"
echo "CDK handler:   src/infrastructure/jobs/lambdaHandler.handler"
echo "Video handler: ${VIDEO_HANDLER_OUT} (exports 'handler')"
echo "CDK handler:   src/infrastructure/jobs/videoCompleteHandler.handler"
du -sh "${LAMBDA_DIR}"
