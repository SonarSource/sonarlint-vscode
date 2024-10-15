/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2024 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { logToSonarLintOutput } from '../util/logging';
import { FileSystemService } from './fileSystemService';
import { FileSystemSubscriber } from './fileSystemSubscriber';
import { minimatch } from 'minimatch';

export class FileSystemServiceImpl implements FileSystemService {
  private static _instance: FileSystemServiceImpl;
  listeners= [];

  static init(): void {
    FileSystemServiceImpl._instance = new FileSystemServiceImpl();
  }

  static get instance() : FileSystemServiceImpl {
    return FileSystemServiceImpl._instance;
  }

  subscribe(listener: FileSystemSubscriber) {
    this.listeners.push(listener);
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
          this.listeners.forEach(listener => listener.onFile(configScopeUri.toString(), name, fullFileUri));
        }
        // .sonarlint folder is already handled separately, skipping it in recursive crawl
        if (type === vscode.FileType.Directory && name !== '.sonarlint' && !(await this.isFolderExcluded(fullFileUri))) {
          await this.listFilesRecursively(configScopeUri, fullFileUri);
        }
      }
    } catch (error) {
      logToSonarLintOutput(`Error encountered while listing files recursively, ${error}`);
    }
  }

  async didRemoveWorkspaceFolder(folder: vscode.WorkspaceFolder) {
    for(const listener of this.listeners) {
      listener.didRemoveWorkspaceFolder(folder.uri);
    }
  }

  async didAddWorkspaceFolder(folder: vscode.WorkspaceFolder) {
    this.crawlDirectory(folder.uri);
  }

  async isFolderExcluded(folderUri: vscode.Uri): Promise<boolean> {
    const filesExclude = vscode.workspace.getConfiguration('files').get<{ [key: string]: boolean }>('exclude');
    const searchExclude = vscode.workspace.getConfiguration('search').get<{ [key: string]: boolean }>('exclude');

    const isExcluded = (excludeConfig: { [key: string]: boolean } | undefined): boolean => {
        if (!excludeConfig) {
            return false;
        }
        return Object.keys(excludeConfig).some(pattern => {
            const glob = new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], pattern);
            return excludeConfig[pattern] && minimatch(vscode.workspace.asRelativePath(folderUri), glob.pattern);
        });
    };

    return isExcluded(filesExclude) || isExcluded(searchExclude);
}
}
