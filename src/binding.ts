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

  async updateBinding(workspaceFolderUri: VSCode.Uri, projectBinding: ProjectBinding): Promise<void> {
    const config = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolderUri);
    return config.update(PROJECT_BINDING_PROPERTY, projectBinding, VSCode.ConfigurationTarget.WorkspaceFolder);
  }

  async deleteBinding(workspaceFolderUri: VSCode.Uri): Promise<void> {
    const config = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolderUri);
    return config.update(PROJECT_BINDING_PROPERTY, undefined, VSCode.ConfigurationTarget.WorkspaceFolder);
  }

  async getAllBindings() : Promise<Map<string, Map<string,ProjectBinding[]>>> {
    const bindings = new Map<string,Map<string, ProjectBinding[]>>();

    for (const folder of VSCode.workspace.workspaceFolders || []) {
      const config = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, folder.uri);
      const binding =  config.get<ProjectBinding>(PROJECT_BINDING_PROPERTY);
      if (binding) {
        const connectionId = binding.connectionId ||  binding.serverId || '<default>';
        let connectionBindings = bindings.get(connectionId);
        if (!bindings.has(connectionId)) {
          bindings.set(connectionId, new Map<string,ProjectBinding[]>());
        }
        connectionBindings = bindings.get(connectionId);
        if (!connectionBindings.has(binding.projectKey)) {
          connectionBindings.set(binding.projectKey, []);
        }
        connectionBindings.get(binding.projectKey).push(binding);
      }
    }
    return bindings;
  }


}

export interface ProjectBinding {
  projectKey: string,
  serverId?: string,
  connectionId?: string
}
