/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { getFileNameFromFullPath, getRelativePathFromFullPath } from '../util/uri';
import * as vscode from 'vscode';

export class FindingsFileNode extends vscode.TreeItem {
  constructor(
    public readonly fileUri: string,
    public readonly findingsCount: number,
    public readonly category?: 'new' | 'older',
    public readonly isNotebook = false,
    public readonly notebookCellUris?: string[]
  ) {
    super(getFileNameFromFullPath(fileUri), vscode.TreeItemCollapsibleState.Expanded);
    
    this.contextValue = 'findingsFileGroup';
    const categorySuffix = category ? `_${category}` : '';
    this.id = `${fileUri}${categorySuffix}`;
    this.resourceUri = vscode.Uri.parse(fileUri);
    
    const specifyWorkspaceFolderName = vscode.workspace.workspaceFolders?.length > 1;
    // no need to compute relative path if file is outside any workspace folder
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(this.resourceUri);
    this.description = vscode.workspace.workspaceFolders && workspaceFolder ? getRelativePathFromFullPath(
      fileUri,
      workspaceFolder,
      specifyWorkspaceFolderName
    ) : '';
    
    this.iconPath = vscode.ThemeIcon.File;
    
    if (category) {
      const categoryText = category === 'new' ? 'new code' : 'older code';
      this.tooltip = `${findingsCount} SonarQube Finding(s) in ${categoryText}`;
    } else {
      this.tooltip = `${findingsCount} SonarQube Finding(s)`;
    }
  }
}