/* --------------------------------------------------------------------------------------------
 * SonarLint Dogfood
 * Copyright (C) 2021-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
export const CONFIG_SECTION = 'sonarlint-dogfood';
export const PIN_VERSION_CONFIG_KEY = 'pinVersion';

export const COMMAND_CHECK_NOW = 'SonarLintDogfood.CheckNow';
export const COMMAND_AUTHENTICATE = 'SonarLintDogfood.Authenticate';

const ARTIFACTORY_BASE_URL = 'https://repox.jfrog.io/repox';
export const ARTIFACTORY_VSCODE_PATH = `${ARTIFACTORY_BASE_URL}/sonarsource/org/sonarsource/sonarlint/vscode/sonarlint-vscode`;
export const ARTIFACTORY_DOGFOOD_URL = `${ARTIFACTORY_VSCODE_PATH}/dogfood.json`;

export const DOGFOOD_ARTIFACTORY_USER_TOKEN = 'SonarLintDogfood.ArtifactoryUserToken';