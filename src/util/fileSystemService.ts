/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2024 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { logToSonarLintOutput } from './logging';

export class FileSystemService {
  private static _instance: FileSystemService;
  fileListeners= [];

  static init(): void {
    FileSystemService._instance = new FileSystemService();
  }

  static get instance() : FileSystemService {
    return FileSystemService._instance;
  }

  subscribeOnFile(listener) {
    this.fileListeners.push(listener);
  }

  public async crawlDirectory(uri: Uri) {
    await this.listFilesRecursively(uri, uri);
  }

  private async listFilesRecursively(configScopeUri: Uri, currentDirectory: Uri) {
    try {
      const files = await vscode.workspace.fs.readDirectory(currentDirectory);
      for (const [name, type] of files) {
        const fullFileUri = vscode.Uri.joinPath(currentDirectory, name);

        if (type === vscode.FileType.File) {
          // Call the listeners; Only pass Uri of configScope, not child directories
          this.fileListeners.forEach(listener => listener(configScopeUri.toString(), name, fullFileUri));
        }
        // .sonarlint folder is already handled separately, skipping it in recursive crawl
        if (type === vscode.FileType.Directory && name !== '.sonarlint') {
          await this.listFilesRecursively(configScopeUri, fullFileUri);
        }
      }
    } catch (error) {
      logToSonarLintOutput(`Error encountered while listing files recursively, ${error}`);
    }
  }
}