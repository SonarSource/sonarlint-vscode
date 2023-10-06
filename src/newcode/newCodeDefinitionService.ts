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
      const toggleLabel = `Focus on ${this.focusOnNewCode ? 'overall code' : 'new code'}`;
      VSCode.window.showQuickPick([{ label: toggleLabel }, { label: `Learn how to deliver clean code with Clean as You Code` }])
        .then(async item => {
          if (item.label === toggleLabel) {
            await VSCode.workspace.getConfiguration('sonarlint')
              .update('focusOnNewCode', !this.focusOnNewCode, VSCode.ConfigurationTarget.Global);
          }
          if (item.label === `Learn how to deliver clean code with Clean as You Code`) {
            VSCode.env.openExternal(VSCode.Uri.parse('https://docs.sonarsource.com/sonarlint/vs-code/using-sonarlint/investigating-issues/#focusing-on-new-code'));
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
    const genericMessage = 'SonarLint focus helps you to deliver clean code by focusing on code that was recently modified';
    let newCodeDefinitionMessage = '';
    if (newCodeDefinition && this.focusOnNewCode) {
      newCodeDefinitionMessage = newCodeDefinition.newCodeDefinitionOrMessage;
    } else if (!this.focusOnNewCode) {
      newCodeDefinitionMessage = 'The SonarLint focus setting is disabled';
    } else if (!newCodeDefinition) {
      newCodeDefinitionMessage = 'There is no new code definition for the project';
    }
    if (newCodeDefinitionMessage.length > 0) {
      newCodeDefinitionMessage = `\n\nIssues shown: ${newCodeDefinitionMessage}`;
    }
    this.newCodeStatusBarItem.tooltip = `${genericMessage}${newCodeDefinitionMessage}`;
  }

  isSupportedForFile(newCodeDefinition: NewCodeDefinition) {
    if (newCodeDefinition && this.focusOnNewCode) {
      return newCodeDefinition.isSupported;
    }
    return false;
  }

  updateStatusBarText(isSupportedForFile: boolean) {
    const enabledText = this.focusOnNewCode && isSupportedForFile ? 'new code' : 'overall code';
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


