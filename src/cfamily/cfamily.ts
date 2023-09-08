/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SONARLINT_CATEGORY } from '../settings/settings';
import { SonarLintDocumentation } from '../commons';
import { DONT_ASK_AGAIN_ACTION } from '../util/showMessage';

const PATH_TO_COMPILE_COMMANDS = 'pathToCompileCommands';
const FULL_PATH_TO_COMPILE_COMMANDS = `${SONARLINT_CATEGORY}.${PATH_TO_COMPILE_COMMANDS}`;
const DO_NOT_ASK_ABOUT_COMPILE_COMMANDS_FLAG = 'doNotAskAboutCompileCommands';
let remindMeLaterAboutCompileCommandsFlag = false;

function showMessageAndUpdateConfig(compilationDbPath: string) {
  vscode.window.showInformationMessage(
    `Analysis configured. Compilation database path is set to: ${compilationDbPath}`
  );
  const [pathForSettings, workspaceFolder] = tryRelativizeToWorkspaceFolder(compilationDbPath);

  if (workspaceFolder !== undefined) {
    const config = vscode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri);
    return config.update(PATH_TO_COMPILE_COMMANDS, pathForSettings, vscode.ConfigurationTarget.WorkspaceFolder);
  }
  return vscode.workspace
    .getConfiguration()
    .update(FULL_PATH_TO_COMPILE_COMMANDS, pathForSettings, vscode.ConfigurationTarget.Workspace);
}

function tryRelativizeToWorkspaceFolder(filePath: string): [string, vscode.WorkspaceFolder] {
  if (!path.isAbsolute(filePath)) {
    return [filePath, undefined];
  }
  for (const folder of vscode.workspace.workspaceFolders || []) {
    const folderPath = folder.uri.fsPath;
    if (filePath.startsWith(folderPath)) {
      const pathWithVariable = `\${workspaceFolder}${filePath.replace(folderPath, '')}`;
      return [pathWithVariable, folder];
    }
  }
  return [filePath, undefined];
}

export async function configureCompilationDatabase() {
  const paths = (await vscode.workspace.findFiles(`**/compile_commands.json`)).filter(path =>
    fs.existsSync(path.fsPath)
  );
  if (paths.length === 0) {
    vscode.window.showWarningMessage(`No compilation databases were found in the workspace\n 
[How to generate compile commands](${SonarLintDocumentation.C_CPP_ANALYSIS})`);
    vscode.workspace
      .getConfiguration()
      .update(FULL_PATH_TO_COMPILE_COMMANDS, undefined, vscode.ConfigurationTarget.Workspace);
  } else {
    await showCompilationDatabaseOptions(paths);
  }
}

export function notifyMissingCompileCommands(context: vscode.ExtensionContext) {
  return async () => {
    if ((await doNotAskAboutCompileCommandsFlag(context)) || remindMeLaterAboutCompileCommandsFlag) {
      return;
    }
    const remindMeLaterAction = 'Ask me later';
    const configureCompileCommandsAction = 'Configure compile commands';
    const message = `SonarLint is unable to analyze C and C++ file(s) because there is no configured compilation 
      database.`;
    vscode.window
      .showWarningMessage(message, configureCompileCommandsAction, remindMeLaterAction, DONT_ASK_AGAIN_ACTION)
      .then(selection => {
        switch (selection) {
          case DONT_ASK_AGAIN_ACTION:
            context.workspaceState.update(DO_NOT_ASK_ABOUT_COMPILE_COMMANDS_FLAG, true);
            break;
          case configureCompileCommandsAction:
            configureCompilationDatabase();
            break;
          case remindMeLaterAction:
            remindMeLaterAboutCompileCommandsFlag = true;
            break;
        }
      });
  };
}

async function doNotAskAboutCompileCommandsFlag(context: vscode.ExtensionContext): Promise<boolean> {
  return context.workspaceState.get(DO_NOT_ASK_ABOUT_COMPILE_COMMANDS_FLAG, false);
}

interface IndexQP extends vscode.QuickPickItem {
  index: number;
}

async function showCompilationDatabaseOptions(paths: vscode.Uri[]) {
  if (paths.length === 1) {
    return showMessageAndUpdateConfig(paths[0].fsPath);
  }
  const items = paths.map((path, i) => ({ label: path.fsPath, description: ``, index: i }));
  items.sort((i1, i2) => i1.label.localeCompare(i2.label));
  const options = { placeHolder: 'Pick a compilation database' };
  const selection: IndexQP | undefined = await vscode.window.showQuickPick(items, options);
  if (selection) {
    return showMessageAndUpdateConfig(paths[selection.index].fsPath);
  }
  return undefined;
}
