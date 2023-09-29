/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as VSCode from 'vscode';
import { SubmitNewCodeDefinitionParams } from '../lsp/protocol';
import { Commands } from '../util/commands';
import { code2ProtocolConverter } from '../util/uri';


export class NewCodeDefinitionService {

  private static _instance: NewCodeDefinitionService;
  private readonly newCodeDefinitionByFolderUriCache = new Map<string, NewCodeDefinition>();
  private newCodeStatusBarItem: VSCode.StatusBarItem;
  private focusOnNewCode: boolean;

  constructor() {
    this.focusOnNewCode = this.getFocusOnNewCodeFromConfiguration();
  }

  static init(context: VSCode.ExtensionContext): void {
    NewCodeDefinitionService._instance = new NewCodeDefinitionService();
    NewCodeDefinitionService._instance.createNewCodeDefinitionStatusBarItem(context);
  }

  static get instance(): NewCodeDefinitionService {
    return NewCodeDefinitionService._instance;
  }

  updateNewCodeDefinitionForFolderUri(params: SubmitNewCodeDefinitionParams) {
    this.newCodeDefinitionByFolderUriCache.set(params.folderUri,
      {
        isSupported: params.isSupported,
        newCodeDefinitionOrMessage: params.newCodeDefinitionOrMessage
      });
    this.updateNewCodeStatusBarItem(VSCode.window.activeTextEditor);
  }

  getNewCodeDefinition(folderUri: string): NewCodeDefinition {
    return this.newCodeDefinitionByFolderUriCache.get(folderUri);
  }

  createNewCodeDefinitionStatusBarItem(context: VSCode.ExtensionContext) {
    context.subscriptions.push(VSCode.commands.registerCommand(Commands.NEW_CODE_DEFINITION, () => {
      VSCode.window.showQuickPick([{ label: `Toggle 'SonarLint focus'` }, { label: `Learn more about 'Clean as You Code'` }])
        .then(async item => {
          if (item.label === `Toggle 'SonarLint focus'`) {
            await VSCode.workspace.getConfiguration('sonarlint')
              .update('focusOnNewCode', !this.focusOnNewCode, VSCode.ConfigurationTarget.Global);
          }
          if (item.label === `Learn more about 'Clean as You Code'`) {
            VSCode.env.openExternal(VSCode.Uri.parse('https://docs.sonarsource.com/sonarlint/vs-code/using-sonarlint/investigating-issues/#clean-as-you-code-mode'));
          }
        });
    }));
    this.focusOnNewCode = VSCode.workspace.getConfiguration().get('sonarlint.focusOnNewCode', false);
    this.newCodeStatusBarItem = VSCode.window.createStatusBarItem(VSCode.StatusBarAlignment.Left, 0);

    this.newCodeStatusBarItem.command = Commands.NEW_CODE_DEFINITION;
    context.subscriptions.push(this.newCodeStatusBarItem);
    this.updateNewCodeStatusBarItem(VSCode.window.activeTextEditor);
  }

  updateNewCodeStatusBarItem(textEditor?: VSCode.TextEditor) {
    const scheme = textEditor?.document?.uri?.scheme;
    if (scheme !== 'file') {
      this.newCodeStatusBarItem.hide();
      return;
    }
    const textDocument = textEditor.document;
    const uri = textDocument.uri;
    const workspaceFolder = VSCode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      this.newCodeStatusBarItem.hide();
      return;
    }
    const newCodeDefinition = this.getNewCodeDefinition(code2ProtocolConverter(workspaceFolder.uri));
    this.updateStatusBarTooltip(newCodeDefinition);
    this.updateStatusBarText(this.isSupportedForFile(newCodeDefinition));
    this.newCodeStatusBarItem.show();
  }

  private updateStatusBarTooltip(newCodeDefinition: NewCodeDefinition) {
    let tooltipTitle = 'Showing all issues';
    let tooltipMessage = '';
    if (newCodeDefinition && this.focusOnNewCode) {
      tooltipMessage = newCodeDefinition.newCodeDefinitionOrMessage;
      if (newCodeDefinition.isSupported) {
        tooltipTitle = `Showing issues on new code`;
      }
    } else if (!this.focusOnNewCode) {
      tooltipMessage = 'Focus on New Code is disabled in settings';
    } else if (!newCodeDefinition) {
      tooltipMessage = 'There is no new code definition for the project';
    }
    if (tooltipMessage.length > 0) {
      tooltipMessage = `\n${tooltipMessage}`;
    }
    this.newCodeStatusBarItem.tooltip = `${tooltipTitle}${tooltipMessage}`;
  }

  isSupportedForFile(newCodeDefinition:NewCodeDefinition) {
    if (newCodeDefinition && this.focusOnNewCode) {
      return newCodeDefinition.isSupported;
    }
    return false;
  }

  updateStatusBarText(isSupportedForFile: boolean) {
    const enabledText = this.focusOnNewCode && isSupportedForFile ? 'New Code' : 'Overall Code';
    this.newCodeStatusBarItem.text = `SonarLint focus: ${enabledText}`;
  }

  updateFocusOnNewCodeState() {
    this.focusOnNewCode = this.getFocusOnNewCodeFromConfiguration();
    this.updateNewCodeStatusBarItem(VSCode.window.activeTextEditor);
  }

  private getFocusOnNewCodeFromConfiguration() {
    return VSCode.workspace.getConfiguration('sonarlint').get('focusOnNewCode', false);
  }
}

export interface NewCodeDefinition {
  newCodeDefinitionOrMessage: string;
  isSupported: boolean;
}


