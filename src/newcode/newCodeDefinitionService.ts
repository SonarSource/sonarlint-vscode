/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as VSCode from 'vscode';
import { ExtendedClient } from '../lsp/protocol';
import { Commands } from '../util/commands';
import { code2ProtocolConverter } from '../util/uri';
import { StatusBarService } from '../statusbar/statusBar';


export class NewCodeDefinitionService {

  private static _instance: NewCodeDefinitionService;
  private readonly newCodeDefinitionByFolderUriCache = new Map<string, NewCodeDefinition>();
  private focusOnNewCode: boolean;

  constructor() {
    this.focusOnNewCode = this.getFocusOnNewCodeFromConfiguration();
  }

  static init(context: VSCode.ExtensionContext): void {
    NewCodeDefinitionService._instance = new NewCodeDefinitionService();
    NewCodeDefinitionService._instance.registerNewCodeDefinitionCommand(context);
  }

  static get instance(): NewCodeDefinitionService {
    return NewCodeDefinitionService._instance;
  }

  updateNewCodeDefinitionForFolderUri(params: ExtendedClient.SubmitNewCodeDefinitionParams) {
    this.newCodeDefinitionByFolderUriCache.set(params.folderUri,
      {
        isSupported: params.isSupported,
        newCodeDefinitionOrMessage: params.newCodeDefinitionOrMessage
      });
  }

  getNewCodeDefinition(folderUri: string): NewCodeDefinition {
    return this.newCodeDefinitionByFolderUriCache.get(folderUri);
  }

  registerNewCodeDefinitionCommand(context: VSCode.ExtensionContext) {
    context.subscriptions.push(VSCode.commands.registerCommand(Commands.NEW_CODE_DEFINITION, async () => {
      await VSCode.workspace.getConfiguration('sonarlint')
        .update('focusOnNewCode', !this.focusOnNewCode, VSCode.ConfigurationTarget.Global);
    }));
    this.focusOnNewCode = VSCode.workspace.getConfiguration().get('sonarlint.focusOnNewCode', false);
  }

  updateFocusOnNewCodeState() {
    this.focusOnNewCode = this.getFocusOnNewCodeFromConfiguration();
    StatusBarService.instance.updateFocusOnNewCode(this.focusOnNewCode);
  }

  private getFocusOnNewCodeFromConfiguration() {
    return VSCode.workspace.getConfiguration('sonarlint').get('focusOnNewCode', false);
  }
}

export interface NewCodeDefinition {
  newCodeDefinitionOrMessage: string;
  isSupported: boolean;
}
