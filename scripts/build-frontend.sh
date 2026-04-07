#!/usr/bin/env bash
set -euo pipefail

DIST_DIR=${DIST_DIR:-dist}
FRONTEND_DIR=${FRONTEND_DIR:-frontend}
ARTIFACT_NAME=${ARTIFACT_NAME:-frontend-bundle.zip}

echo "Cleaning ${DIST_DIR}..."
rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

echo "Copying frontend assets..."
cp -r "${FRONTEND_DIR}" "${DIST_DIR}/frontend"

echo "Bundling artifact..."
(
  cd "${DIST_DIR}"
  zip -r "${ARTIFACT_NAME}" frontend >/dev/null
)

echo "Built ${DIST_DIR}/${ARTIFACT_NAME}"
