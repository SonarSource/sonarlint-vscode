/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2024 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import { FolderUriParams, FoundFileDto, ListFilesInScopeResponse } from '../lsp/protocol';
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

  public async listFilesRecursively(uri: Uri) {
    try {
      const files = await vscode.workspace.fs.readDirectory(uri);
      for (const [name, type] of files) {
        const fullFileUri = vscode.Uri.joinPath(uri, name);

        if (type === vscode.FileType.File) {
          this.fileListeners.forEach(async (listener) => await listener(name, fullFileUri));
        }
        // .sonarlint folder is already handled separately, skipping it in recursive crawl
        if (type === vscode.FileType.Directory && name !== '.sonarlint') {
          await this.listFilesRecursively(fullFileUri);
        }
      }
    } catch (error) {
      logToSonarLintOutput(`Error encountered while listing files recursively, ${error}`);
    }
  }
}