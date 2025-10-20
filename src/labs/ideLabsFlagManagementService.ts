/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as vscode from 'vscode';
import { ContextManager } from '../contextManager';

export class IdeLabsFlagManagementService {
  private static _instance: IdeLabsFlagManagementService;
  private readonly IDE_LABS_ENABLED_FLAG_KEY = 'sonarqube.ideLabsEnabled';
  
  private constructor(private readonly context: vscode.ExtensionContext) {
  }

  public static init(context: vscode.ExtensionContext): void {
    IdeLabsFlagManagementService._instance = new IdeLabsFlagManagementService(context);
  }

  static get instance(): IdeLabsFlagManagementService {
    return IdeLabsFlagManagementService._instance;
  }

  public async enableIdeLabs(): Promise<void> {
    await this.context.globalState.update(this.IDE_LABS_ENABLED_FLAG_KEY, true);
    ContextManager.instance.setIdeLabsContext(true);
  }

  public async disableIdeLabs(): Promise<void> {
    await this.context.globalState.update(this.IDE_LABS_ENABLED_FLAG_KEY, false);
    ContextManager.instance.setIdeLabsContext(false);
  }

  public isIdeLabsEnabled(): boolean {
    return this.context.globalState.get(this.IDE_LABS_ENABLED_FLAG_KEY, false);
  }
}
