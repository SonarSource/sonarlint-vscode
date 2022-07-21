/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as VSCode from 'vscode';

const SONARLINT_CATEGORY = 'sonarlint';
const PROJECT_BINDING_PROPERTY = 'connectedMode.project';

export class BindingService {

  private static _instance: BindingService;

  static init(): void {
    BindingService._instance = new BindingService();
  }

  static get instance(): BindingService {
    return BindingService._instance;
  }

  async updateWorkspaceFolderBinding(workspaceFolderUri: VSCode.Uri, projectKey: string): Promise<void> {
    const config = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolderUri);
    return config.update(PROJECT_BINDING_PROPERTY, { projectKey }, VSCode.ConfigurationTarget.WorkspaceFolder);
  }

  async deleteWorkspaceFolderBinding(workspaceFolderUri: VSCode.Uri): Promise<void> {
    const config = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolderUri);
    return config.update(PROJECT_BINDING_PROPERTY, undefined, VSCode.ConfigurationTarget.WorkspaceFolder);
  }

}
