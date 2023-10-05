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
  private cleanAsYouCode: boolean;

  constructor() {
    this.cleanAsYouCode = this.getCleanAsYouCodeFromConfiguration();
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
      VSCode.window.showQuickPick([{ label: `Toggle 'Clean as You Code'` }, { label: `Learn more about 'Clean as You Code'` }])
        .then(async item => {
          if (item.label === `Toggle 'Clean as You Code'`) {
            await VSCode.workspace.getConfiguration('sonarlint')
              .update('cleanAsYouCode', !this.cleanAsYouCode, VSCode.ConfigurationTarget.Global);
          }
          if (item.label === `Learn more about 'Clean as You Code'`) {
            VSCode.env.openExternal(VSCode.Uri.parse('https://docs.sonarsource.com/sonarlint/vs-code/using-sonarlint/investigating-issues/#focusing-on-new-code'));
          }
        });
    }));
    this.cleanAsYouCode = VSCode.workspace.getConfiguration().get('sonarlint.cleanAsYouCode', false);
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
    let isSupportedForFile = false;
    const textDocument = textEditor.document;
    const uri = textDocument.uri;
    const workspaceFolder = VSCode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      this.newCodeStatusBarItem.hide();
      return;
    }
    const newCodeDefinition = this.getNewCodeDefinition(code2ProtocolConverter(workspaceFolder.uri));
    if (newCodeDefinition && this.cleanAsYouCode) {
      if (newCodeDefinition.isSupported) {
        this.newCodeStatusBarItem.tooltip = `Showing issues on new code\n${newCodeDefinition.newCodeDefinitionOrMessage}`;
      }
      isSupportedForFile = newCodeDefinition.isSupported;
    } else {
      this.newCodeStatusBarItem.tooltip = 'Showing all issues';
    }
    this.updateStatusBarText(isSupportedForFile);
    this.newCodeStatusBarItem.show();

  }

  updateStatusBarText(isSupportedForFile: boolean) {
    const enabledText = this.cleanAsYouCode && isSupportedForFile ? 'on' : 'off';
    this.newCodeStatusBarItem.text = `Clean as You Code: ${enabledText}`;
  }

  updateCleanAsYouCodeState() {
    this.cleanAsYouCode = this.getCleanAsYouCodeFromConfiguration();
    this.updateNewCodeStatusBarItem(VSCode.window.activeTextEditor);
  }

  private getCleanAsYouCodeFromConfiguration() {
    return VSCode.workspace.getConfiguration('sonarlint').get('cleanAsYouCode', false);
  }
}

export interface NewCodeDefinition {
  newCodeDefinitionOrMessage: string;
  isSupported: boolean;
}


