#!/usr/bin/env python3

import requests
import sys
import json
import os

githubProject = os.environ['CIRRUS_REPO_NAME']
buildNumber = os.environ['BUILD_NUMBER']

artifactoryUrl = os.environ['ARTIFACTORY_URL']
artifactoryApiUser = os.environ['ARTIFACTORY_DEPLOY_USERNAME']
artifactoryApiKey = os.environ['ARTIFACTORY_DEPLOY_PASSWORD']

buildInfoUrl = f'{artifactoryUrl}/api/build/{githubProject}/{buildNumber}'

buildInfoResp = requests.get(url=buildInfoUrl, auth=(artifactoryApiUser, artifactoryApiKey))
buildInfoJson = buildInfoResp.json()

buildInfo = buildInfoJson.get('buildInfo', {})
buildInfoProperties = buildInfo.get('properties', {})

version = buildInfoProperties.get('buildInfo.env.PROJECT_VERSION', 'NOT_FOUND')

dogfoodJson = json.dumps({
    'version': version,
    'url': f"{artifactoryUrl}/sonarsource/org/sonarsource/sonarlint/vscode/sonarlint-vscode/{version}/sonarlint-vscode-{version}.vsix"
})
updateDogfoodJsonUrl = f"{artifactoryUrl}/sonarsource-public-builds/org/sonarsource/sonarlint/vscode/sonarlint-vscode/dogfood.json"

response = requests.put(url=updateDogfoodJsonUrl, data=dogfoodJson, auth=(artifactoryApiUser, artifactoryApiKey))
if response.status_code != 201:
    sys.exit('[!] [{0}] Server Error'.format(response.status_code))
