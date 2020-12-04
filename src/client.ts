/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2020 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { LanguageClient } from 'vscode-languageclient';
import { RulesResponse } from './rules';
import { ServerMode } from './java';
import * as VSCode from 'vscode';
import { code2ProtocolConverter } from './uri';

export class SonarLintExtendedLanguageClient extends LanguageClient {
  listAllRules(): Thenable<RulesResponse> {
    return this.sendRequest('sonarlint/listAllRules');
  }

  didClasspathUpdate(projectRoot: VSCode.Uri): void {
    this.sendNotification('sonarlint/didClasspathUpdate', code2ProtocolConverter(projectRoot));
  }

  didJavaServerModeChange(serverMode: ServerMode) {
    this.sendNotification('sonarlint/didJavaServerModeChange', serverMode);
  }
}
