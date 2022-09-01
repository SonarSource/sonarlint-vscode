/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as VSCode from 'vscode';
import { BindingService } from './binding';

export class AutoBindingService {
  private static _instance: AutoBindingService;

  static init(bindingService: BindingService): void {
    AutoBindingService._instance = new AutoBindingService(bindingService);
  }

  constructor(
    private readonly bindingService: BindingService
  ) {}

  static get instance(): AutoBindingService {
    return AutoBindingService._instance;
  }

  async autoBindAllUnboundFolders() {
    const unboundFolders = VSCode.workspace.workspaceFolders
      .filter(workspaceFolder => !this.bindingService.shouldBeAutoBound(workspaceFolder));
    // TODO [SLVSCODE-330] if there's too many unboundFolders - prompt user
    unboundFolders
      .forEach(unboundFolder => {
        this.autoBindFolder(unboundFolder);
      });
  }

  async autoBindFolder(unboundFolder: VSCode.WorkspaceFolder) {
    // TODO [SLVSCODE-326] detect file config and suggest binding
    // TODO [SLVSCODE-328] match by name and suggest binding
  }
}
