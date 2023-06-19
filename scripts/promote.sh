if [ -z "$CIRRUS_PR" ]; then
  STATUS=it-passed
  TARGET=sonarsource-public-builds
else
  STATUS=it-passed-pr
  TARGET=sonarsource-public-dev
fi

jfrog rt bpr \
  --url "${ARTIFACTORY_URL}" \
  --access-token "${ARTIFACTORY_ACCESS_TOKEN}" \
  --status "${STATUS}" "${CIRRUS_REPO_NAME}" "${BUILD_NUMBER}" "${TARGET}"
export PROJECT_VERSION=$(npm pkg get version | tr -d \" | sed "s|-SNAPSHOT|+$BUILD_NUMBER|g")
burgr-notify-promotion
