import requests
import sys
import json

githubSlug = '$(Build.Repository.ID)'
githubProject = githubSlug.split("/", 1)[1]
buildNumber = '$(Build.BuildId)'

buildInfoUrl = f'$(ARTIFACTORY_URL)/api/build/{githubProject}/{buildNumber}'
buildInfoResp = requests.get(url=buildInfoUrl, auth=('$(ARTIFACTORY_API_USER)', '$(ARTIFACTORY_API_KEY)'))
buildInfoJson = buildInfoResp.json()

buildInfo = buildInfoJson.get('buildInfo', {})
buildInfoProperties = buildInfo.get('properties', {})

# PROJECT_VERSION is set by the compute-build-version-step.yml
version = buildInfoProperties.get('buildInfo.env.PROJECT_VERSION', 'NOT_FOUND')

dogfoodJson = json.dumps({
    'version': version,
    'url': f"$(ARTIFACTORY_URL)/sonarsource/org/sonarsource/sonarlint/vscode/sonarlint-vscode/{version}/sonarlint-vscode-{version}.vsix"
})
updateDogfoodJsonUrl = "$(ARTIFACTORY_URL)/sonarsource-public-builds/org/sonarsource/sonarlint/vscode/sonarlint-vscode/dogfood.json"
response = requests.put(url=updateDogfoodJsonUrl, data=dogfoodJson, auth=('$(ARTIFACTORY_API_USER)', '$(ARTIFACTORY_API_KEY)'))
if not response.status_code == 201:
    sys.exit('[!] [{0}] Server Error'.format(response.status_code))
