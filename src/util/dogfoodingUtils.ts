/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

const DOGFOODING_ENVIRONMENT_VARIABLE_NAME = 'SONARSOURCE_DOGFOODING';

export function isDogfoodingEnvironment() : boolean {
    return process.env[DOGFOODING_ENVIRONMENT_VARIABLE_NAME] === '1';
}