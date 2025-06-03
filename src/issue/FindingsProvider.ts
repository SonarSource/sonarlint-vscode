/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as vscode from 'vscode';
import { getFileNameFromFullPath, getRelativePathFromFullPath } from '../util/uri';
import { HotspotNode } from '../hotspot/hotspotsTreeDataProvider';
import { InjectionVulnerabilitiesProvider, ProblemNode } from './InjectionVulnerabilitiesProvider';

export class FileGroup extends vscode.TreeItem {
  public fileUri: string;
  constructor(public readonly id: string) {
    super(getFileNameFromFullPath(id), vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'hotspotsFileGroup';
    this.fileUri = id;
    const specifyWorkspaceFolderName = vscode.workspace.workspaceFolders.length > 1;
    this.resourceUri = vscode.Uri.parse(this.fileUri);
    this.description = getRelativePathFromFullPath(
      id,
      vscode.workspace.getWorkspaceFolder(this.resourceUri),
      specifyWorkspaceFolderName
    );
    this.iconPath = vscode.ThemeIcon.File;
  }
}

export class FindingTypeGroup extends vscode.TreeItem {
  constructor(public readonly type: string) {
    super(type, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'findingTypeGroup';
    this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
  }
}

export class FindingsProvider implements vscode.TreeDataProvider<ProblemNode | FileGroup | HotspotNode | FindingTypeGroup> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<ProblemNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: ProblemNode): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: FindingTypeGroup | FileGroup | ProblemNode
  ): FindingTypeGroup[] | FileGroup[] | ProblemNode[] | HotspotNode[] {
    if (!element) {
      return [
        new FindingTypeGroup('Security'),
        new FindingTypeGroup('Quality'),
      ];
    } else if (element instanceof FindingTypeGroup && element.type === 'Security') {
      return [
        new FindingTypeGroup('Injection Vulnerabilities'),
        new FindingTypeGroup('Security Hotspots'),
        new FindingTypeGroup('SCA')
      ]
    } else if (element instanceof FindingTypeGroup && element.type === 'Injection Vulnerabilities') {
      return InjectionVulnerabilitiesProvider.instance.getChildren();
    } else if (element instanceof FileGroup) {
      return InjectionVulnerabilitiesProvider.instance.getChildren(element);
    }
  }

  getBadgeNumber() {
    return InjectionVulnerabilitiesProvider.instance.getBadgeNumber();
  }
}
