#!/bin/bash

set -euo pipefail

echo '======= Starting GitHub Actions SonarQube Analysis'

# Determine if this is a pull request
if [ "${GITHUB_EVENT_NAME}" == "pull_request" ]; then
    export PULL_REQUEST="${GITHUB_REF##refs/pull/}"
    export PULL_REQUEST="${PULL_REQUEST%/merge}"
    export GITHUB_BRANCH="${GITHUB_HEAD_REF}"
    export GITHUB_BASE_BRANCH="${GITHUB_BASE_REF}"
else
    export PULL_REQUEST="false"
    export GITHUB_BRANCH="${GITHUB_REF_NAME}"
    export GITHUB_BASE_BRANCH="${GITHUB_BASE_REF:-}"
fi

echo "Environment variables set:"
echo "BUILD_NUMBER: $BUILD_NUMBER"
echo "GITHUB_SHA: $GITHUB_SHA"
echo "GITHUB_REPOSITORY: $GITHUB_REPOSITORY"
echo "PULL_REQUEST: $PULL_REQUEST"
echo "GITHUB_BRANCH: $GITHUB_BRANCH"
echo "GITHUB_BASE_BRANCH: $GITHUB_BASE_BRANCH"

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

PROJECT_VERSION=$(npm pkg get version | tr -d \")
SONAR_ORGANIZATION="sonarsource"
SONAR_PROJECT_NAME="SonarLint for VSCode"

# Check if SONAR_URL contains is SQC US and set region parameter accordingly
SONAR_REGION_PARAM=""
if [[ "$SONAR_URL" == *"sonarqube.us"* ]]; then
  SONAR_REGION_PARAM="-Dsonar.region=US"
fi


if [ "${GITHUB_BRANCH}" == "master" ] && [ "$PULL_REQUEST" == "false" ]; then
  echo '======= Analyze master branch'

  git fetch origin "${GITHUB_BRANCH}"

  # Analyze with SNAPSHOT version as long as SQ does not correctly handle
  # purge of release data

  npx sonar-scanner \
      -Dsonar.projectKey="$SONAR_PROJECT_KEY" \
      -Dsonar.organization="$SONAR_ORGANIZATION" \
      -Dsonar.projectName="$SONAR_PROJECT_NAME" \
      -Dsonar.projectVersion="$PROJECT_VERSION" \
      -Dsonar.host.url="$SONAR_URL" \
      -Dsonar.token="$SONAR_TOKEN" \
      -Dsonar.analysis.buildNumber="$BUILD_NUMBER" \
      -Dsonar.analysis.pipeline="$GITHUB_RUN_ID" \
      -Dsonar.analysis.sha1="$GITHUB_SHA"  \
      -Dsonar.analysis.repository="$GITHUB_REPOSITORY" \
      $SONAR_REGION_PARAM

elif [[ "${GITHUB_BRANCH}" == "branch-"* ]] && [ "$PULL_REQUEST" == "false" ]; then
  # analyze maintenance branches as long-living branches

  # Fetch all commit history so that SonarQube has exact blame information
  # for issue auto-assignment
  # This command can fail with "fatal: --unshallow on a complete repository does not make sense"
  # if there are not enough commits in the Git repository
  # For this reason errors are ignored with "|| true"
  git fetch --unshallow || true

  git fetch origin "${GITHUB_BRANCH}"

  npx sonar-scanner \
      -Dsonar.projectKey="$SONAR_PROJECT_KEY" \
      -Dsonar.organization="$SONAR_ORGANIZATION" \
      -Dsonar.projectName="$SONAR_PROJECT_NAME" \
      -Dsonar.host.url="$SONAR_URL" \
      -Dsonar.token="$SONAR_TOKEN" \
      -Dsonar.analysis.buildNumber="$BUILD_NUMBER" \
      -Dsonar.analysis.pipeline="$GITHUB_RUN_ID" \
      -Dsonar.analysis.sha1="$GITHUB_SHA"  \
      -Dsonar.analysis.repository="$GITHUB_REPOSITORY" \
      -Dsonar.branch.name="$GITHUB_BRANCH" \
      $SONAR_REGION_PARAM

elif [ "$PULL_REQUEST" != "false" ]; then
  echo '======= Analyze pull request'

  npx sonar-scanner \
      -Dsonar.projectKey="$SONAR_PROJECT_KEY" \
      -Dsonar.organization="$SONAR_ORGANIZATION" \
      -Dsonar.projectName="$SONAR_PROJECT_NAME" \
      -Dsonar.host.url="$SONAR_URL" \
      -Dsonar.token="$SONAR_TOKEN" \
      -Dsonar.analysis.buildNumber="$BUILD_NUMBER" \
      -Dsonar.analysis.pipeline="$GITHUB_RUN_ID" \
      -Dsonar.analysis.sha1="$GITHUB_SHA"  \
      -Dsonar.analysis.repository="$GITHUB_REPOSITORY" \
      -Dsonar.analysis.prNumber="$PULL_REQUEST" \
      $SONAR_REGION_PARAM

elif [[ "$GITHUB_BRANCH" == "feature/long/"* ]] && [ "$PULL_REQUEST" == "false" ]; then
  echo '======= Analyze long lived feature branch'

  npx sonar-scanner \
      -Dsonar.projectKey="$SONAR_PROJECT_KEY" \
      -Dsonar.organization="$SONAR_ORGANIZATION" \
      -Dsonar.projectName="$SONAR_PROJECT_NAME" \
      -Dsonar.host.url="$SONAR_URL" \
      -Dsonar.token="$SONAR_TOKEN" \
      -Dsonar.analysis.buildNumber="$BUILD_NUMBER" \
      -Dsonar.analysis.pipeline="$GITHUB_RUN_ID" \
      -Dsonar.analysis.sha1="$GITHUB_SHA"  \
      -Dsonar.analysis.repository="$GITHUB_REPOSITORY" \
      -Dsonar.analysis.prNumber="$PULL_REQUEST" \
      -Dsonar.branch.name="$GITHUB_BRANCH" \
      $SONAR_REGION_PARAM

else
  echo '======= No analysis'
fi

echo '======= GitHub Actions SonarQube Analysis Complete'
