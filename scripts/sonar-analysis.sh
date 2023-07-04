#!/bin/bash

set -euo pipefail

# Fetch all commit history so that SonarQube has exact blame information
# for issue auto-assignment
# This command can fail with "fatal: --unshallow on a complete repository does not make sense"
# if there are not enough commits in the Git repository
# For this reason errors are ignored with "|| true"
git fetch --unshallow || true

# fetch references from github for PR analysis
if [ -n "${GITHUB_BASE_BRANCH}" ]; then
	git fetch origin "${GITHUB_BASE_BRANCH}"
fi

# PIPELINE_ID is used by burgr to identify stages of the pipeline
if [ -z "$PIPELINE_ID" ]; then
  PIPELINE_ID=$BUILD_NUMBER
fi

if [ "$PULL_REQUEST" != "false" ]; then
  echo "======= Analyze PR $PULL_REQUEST"
  node_modules/sonarqube-scanner/src/bin/sonar-scanner \
      -Dsonar.projectKey="org.sonarsource.sonarlint.vscode:sonarlint-vscode" \
      -Dsonar.organization="sonarsource" \
      -Dsonar.projectName="SonarLint for VSCode" \
      -Dsonar.host.url="$SONARQUBE_NEXT_URL" \
      -Dsonar.token="$SONARQUBE_NEXT_TOKEN" \
      -Dsonar.analysis.buildNumber="$BUILD_NUMBER" \
      -Dsonar.analysis.pipeline="$PIPELINE_ID" \
      -Dsonar.analysis.sha1="$GIT_SHA1"  \
      -Dsonar.analysis.repository="$GITHUB_REPO" \
      -Dsonar.sources="src" \
      -Dsonar.tests="test,its/src" \
      -Dsonar.exclusions="test/**, build/**, out/**, out-cov/**, coverage/**, node_modules/**, **/node_modules/**, **/its/**, **/dogfood/**" \
      -Dsonar.javascript.lcov.reportPaths="coverage/lcov.info" \
      -Dsonar.coverage.exclusions="gulpfile.js, webpack.config.js, scripts/**" \
      -Dsonar.pullrequest.branch="$GITHUB_BRANCH" \
      -Dsonar.pullrequest.base="$GITHUB_BASE_BRANCH" \
      -Dsonar.pullrequest.key="$PULL_REQUEST"
else
  echo "======= Analyze branch ${GITHUB_BRANCH}"

  git fetch origin "${GITHUB_BRANCH}"

  node_modules/sonarqube-scanner/src/bin/sonar-scanner \
      -Dsonar.projectKey="org.sonarsource.sonarlint.vscode:sonarlint-vscode" \
      -Dsonar.organization="sonarsource" \
      -Dsonar.projectName="SonarLint for VSCode" \
      -Dsonar.host.url="$SONARQUBE_NEXT_URL" \
      -Dsonar.token="$SONARQUBE_NEXT_TOKEN" \
      -Dsonar.analysis.buildNumber="$BUILD_NUMBER" \
      -Dsonar.analysis.pipeline="$PIPELINE_ID" \
      -Dsonar.analysis.sha1="$GIT_SHA1"  \
      -Dsonar.analysis.repository="$GITHUB_REPO" \
      -Dsonar.sources="src" \
      -Dsonar.tests="test,its/src" \
      -Dsonar.exclusions="test/**, build/**, out/**, out-cov/**, coverage/**, node_modules/**, **/node_modules/**, **/its/**, **/dogfood/**" \
      -Dsonar.javascript.lcov.reportPaths="coverage/lcov.info" \
      -Dsonar.coverage.exclusions="gulpfile.js, webpack.config.js, scripts/**"
fi
