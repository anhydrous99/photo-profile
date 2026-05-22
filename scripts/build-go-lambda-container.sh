#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
IMAGE_DIR="${PROJECT_ROOT}/lambda/go-image-processor"
IMAGE_TAG="${GO_LAMBDA_IMAGE_TAG:-photo-profile-go-image-processor:lambda-arm64}"
PLATFORM="linux/arm64"

echo "=== Go Lambda Container Build ==="
echo "Project root: ${PROJECT_ROOT}"
echo "Image dir:    ${IMAGE_DIR}"
echo "Image tag:    ${IMAGE_TAG}"
echo "Platform:     ${PLATFORM}"
echo ""

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is required to build the Go Lambda container image." >&2
  echo "Install Docker Desktop or a Docker Engine with BuildKit/buildx, then rerun: ${0}" >&2
  exit 1
fi

if ! docker buildx version >/dev/null 2>&1; then
  echo "ERROR: docker buildx is required for the Linux ARM64 Go Lambda build." >&2
  echo "Enable Docker BuildKit/buildx, then rerun: ${0}" >&2
  exit 1
fi

echo "→ Building Linux ARM64 Lambda container image..."
docker buildx build \
  --platform "${PLATFORM}" \
  --tag "${IMAGE_TAG}" \
  --load \
  "${IMAGE_DIR}"

echo ""
echo "→ Inspecting built image architecture..."
docker image inspect "${IMAGE_TAG}" \
  --format '  OS={{.Os}} Architecture={{.Architecture}} Size={{.Size}} Entrypoint={{json .Config.Entrypoint}}'

echo ""
echo "=== Go Lambda container build complete ==="
echo "Image: ${IMAGE_TAG}"
echo "Native codec validation: Dockerfile runs TestNativeCapabilities and TestGolden during build."
