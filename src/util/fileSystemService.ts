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
const SONAR_SCANNER_CONFIG_FILENAME = "sonar-project.properties"
const AUTOSCAN_CONFIG_FILENAME = ".sonarcloud.properties"

export class FileSystemService {
  private static _instance: FileSystemService;
  solutionFilesCache : string[] = [];

  constructor() {
  }

  static init(): void {
    FileSystemService._instance = new FileSystemService();
  }

  static get instance() : FileSystemService {
    return FileSystemService._instance;
  }

  get solutionFiles() {
    return this.solutionFilesCache;
  }

  async listAutobindingFilesInFolder(params: FolderUriParams): Promise<ListFilesInScopeResponse> {
    const baseFolderUri = vscode.Uri.parse(params.folderUri)
    const foundFiles: Array<FoundFileDto> = [
      ...await this.listJsonFilesInDotSonarLint(baseFolderUri),
      ...await this.listFilesRecursively(baseFolderUri)
    ];
    return { foundFiles };
  }

  private async listJsonFilesInDotSonarLint(folderUri: vscode.Uri) {
    const dotSonarLintUri = vscode.Uri.joinPath(folderUri, '.sonarlint');
    try {
      const baseFiles = await vscode.workspace.fs.readDirectory(dotSonarLintUri);
      const foundFiles: Array<FoundFileDto> = [];
      for (const [name, type] of baseFiles) {
        const fullFileUri = vscode.Uri.joinPath(dotSonarLintUri, name);

        if (type === vscode.FileType.File) {
          await this.readJsonFiles(name, fullFileUri, foundFiles);
        }
      }
      return foundFiles;
    } catch (error) {
      return [];
    }
  }

  private async readJsonFiles(name: string, fullFileUri: vscode.Uri, foundFiles: Array<FoundFileDto>) {
    let content: string = null;
    if (name.endsWith('.json')) {
      content = (await vscode.workspace.fs.readFile(fullFileUri)).toString();
    }
    foundFiles.push({ fileName: name, filePath: fullFileUri.fsPath, content });
  }

  private async listFilesRecursively(uri: Uri) {
    try {
      const files = await vscode.workspace.fs.readDirectory(uri);
      let foundFiles: Array<FoundFileDto> = [];
      for (const [name, type] of files) {
        const fullFileUri = vscode.Uri.joinPath(uri, name);

        if (type === vscode.FileType.File) {
          await this.readPropertiesFiles(name, fullFileUri, foundFiles);
          this.populateSolutionsFileCache(name);
        }
        // .sonarlint folder is already handled separately, skipping it in recursive crawl
        if (type === vscode.FileType.Directory && name !== '.sonarlint') {
          const subFiles = await this.listFilesRecursively(fullFileUri);
          foundFiles = foundFiles.concat(subFiles);
        }
      }
      return foundFiles;
    } catch (error) {
      return [];
    }
  }

  private async readPropertiesFiles(name: string, fullFileUri: vscode.Uri, foundFiles: Array<FoundFileDto>) {
    let content: string = null;
    if (name === AUTOSCAN_CONFIG_FILENAME || name === SONAR_SCANNER_CONFIG_FILENAME) {
      content = (await vscode.workspace.fs.readFile(fullFileUri)).toString();
    }
    foundFiles.push({ fileName: name, filePath: fullFileUri.fsPath, content });
  }

  private populateSolutionsFileCache(name: string) {
    if (name.endsWith('.sln')) {
      const friendlySolutionName = name.slice(0, -4);
      this.solutionFilesCache.push(friendlySolutionName);
    }
  }
}