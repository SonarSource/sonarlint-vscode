/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import * as VSCode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { ServerMode } from './java';
import { code2ProtocolConverter } from './uri';
import * as protocol from './protocol';
import { RulesResponse } from './protocol';

export class SonarLintExtendedLanguageClient extends LanguageClient {
  listAllRules(): Thenable<RulesResponse> {
    return this.sendRequest(protocol.ListAllRulesRequest.type);
  }

  didClasspathUpdate(projectRoot: VSCode.Uri): void {
    const projectUri = code2ProtocolConverter(projectRoot);
    this.sendNotification(protocol.DidClasspathUpdateNotification.type, { projectUri });
  }

  didJavaServerModeChange(serverMode: ServerMode) {
    this.sendNotification(protocol.DidJavaServerModeChangeNotification.type, { serverMode });
  }

  didLocalBranchNameChange(folderRoot: VSCode.Uri, branchName?: string) {
    const folderUri = code2ProtocolConverter(folderRoot);
    this.sendNotification(protocol.DidLocalBranchNameChangeNotification.type, { folderUri, branchName });
  }

  checkConnection(connectionId: string) {
    return this.sendRequest(protocol.CheckConnection.type, { connectionId });
  }

  getRemoteProjectNames(connectionId: string, projectKeys: Array<string>) {
    return this.sendRequest(protocol.GetRemoteProjectNames.type, { connectionId, projectKeys });
  }

  onTokenUpdate() {
    return this.sendNotification(protocol.OnTokenUpdate.type);
  }

  getRemoteProjectsForConnection(connectionId: string) {
    return this.sendRequest(protocol.GetRemoteProjectsForConnection.type, { connectionId });
  }
}
