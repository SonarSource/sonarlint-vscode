/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as vscode from 'vscode';
import { ContextManager } from '../contextManager';
import { SONARLINT_CATEGORY } from '../settings/settings';

export class IdeLabsFlagManagementService {
  private static _instance: IdeLabsFlagManagementService;
  private readonly IDE_LABS_ENABLED_CONFIG_KEY = 'ideLabsEnabled';
  private readonly IDE_LABS_JOINED_FLAG_KEY = 'sonarqube.ideLabsJoined';
  
  private constructor(private readonly context: vscode.ExtensionContext) {
  }

  public static init(context: vscode.ExtensionContext): void {
    IdeLabsFlagManagementService._instance = new IdeLabsFlagManagementService(context);
  }

  static get instance(): IdeLabsFlagManagementService {
    return IdeLabsFlagManagementService._instance;
  }

  public async joinIdeLabs(): Promise<void> {
    await this.context.globalState.update(this.IDE_LABS_JOINED_FLAG_KEY, true);
    this.enableIdeLabs();
    ContextManager.instance.setIdeLabsJoinedContext(true);
    ContextManager.instance.setIdeLabsEnabledContext(true);
  }
  
  public isIdeLabsJoined(): boolean {
    return this.context.globalState.get(this.IDE_LABS_JOINED_FLAG_KEY, false);
  }

  public isIdeLabsEnabled(): boolean {
    return this.isIdeLabsJoined() && vscode.workspace.getConfiguration(SONARLINT_CATEGORY).get(this.IDE_LABS_ENABLED_CONFIG_KEY, false);
  }

  public enableIdeLabs(): void {
    vscode.workspace.getConfiguration(SONARLINT_CATEGORY).update(this.IDE_LABS_ENABLED_CONFIG_KEY, true, vscode.ConfigurationTarget.Global);
    ContextManager.instance.setIdeLabsEnabledContext(true);
  }

  public disableIdeLabs(): void {
    vscode.workspace.getConfiguration(SONARLINT_CATEGORY).update(this.IDE_LABS_ENABLED_CONFIG_KEY, false, vscode.ConfigurationTarget.Global);
    ContextManager.instance.setIdeLabsEnabledContext(false);
  }

}
