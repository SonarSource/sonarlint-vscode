#!/usr/bin/env bash
set -euo pipefail

TAG_NAME="${TAG_NAME:?TAG_NAME is required}"
PLATFORM="${PLATFORM:?PLATFORM is required}"

VERSION="${TAG_NAME%%+*}"
BASE_URL="https://repox.jfrog.io/artifactory/sonarsource-public-releases/org/sonarsource/sonarlint/vscode/sonarlint-vscode"

if [[ "${PLATFORM}" == "universal" ]]; then
  ARTIFACT_NAME="sonarlint-vscode-${VERSION}.vsix"
else
  ARTIFACT_NAME="sonarlint-vscode-${PLATFORM}-${VERSION}.vsix"
fi

ARTIFACT_URL="${BASE_URL}/${TAG_NAME}/${ARTIFACT_NAME}"

echo "artifactUrl=${ARTIFACT_URL}" >> "${GITHUB_OUTPUT}"
echo "artifactName=${ARTIFACT_NAME}" >> "${GITHUB_OUTPUT}"
