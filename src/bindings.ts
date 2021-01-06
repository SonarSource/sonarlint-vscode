/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as path from 'path';
import * as VSCode from 'vscode';
import { extensionPath } from './util';

class SonarCloudConnectionNode extends VSCode.TreeItem {
  constructor(label: string) {
    super(label, VSCode.TreeItemCollapsibleState.Collapsed);
  }

  iconPath = path.join(extensionPath, 'images', 'sonarcloud_icon.svg');
}

class SonarQubeConnectionNode extends VSCode.TreeItem {
  constructor(label: string) {
    super(label, VSCode.TreeItemCollapsibleState.Collapsed);
  }

  iconPath = path.join(extensionPath, 'images', 'sonarqube_icon.svg');
}

class RemoteProjectNode extends VSCode.TreeItem {
  constructor(label: string) {
    super(label, VSCode.TreeItemCollapsibleState.Collapsed);
  }

  iconPath = path.join(extensionPath, 'images', 'remote_project.svg');
}

class WorkspaceFolderNode extends VSCode.TreeItem {
  constructor(label: string) {
    super(label, VSCode.TreeItemCollapsibleState.None);
  }
}

type BindingNode = WorkspaceFolderNode | RemoteProjectNode | SonarQubeConnectionNode | SonarCloudConnectionNode;

export default class ConnectedModeBindingsProvider implements VSCode.TreeDataProvider<BindingNode> {

  onDidChangeTreeData?: VSCode.Event<BindingNode>;

  getTreeItem(element: BindingNode): VSCode.TreeItem | Thenable<VSCode.TreeItem> {
    return element;
  }

  getChildren(element?: BindingNode): VSCode.ProviderResult<BindingNode[]> {
    if (! element) {
      return [
        new SonarCloudConnectionNode('My personal organization (perso-org)'),
        new SonarCloudConnectionNode('My company organization (company-org)'),
        new SonarQubeConnectionNode('My personal server (perso-server)'),
        new SonarQubeConnectionNode('My company server (company-server)')
      ];
    } else if (element.label.indexOf('My') >= 0) {
      return [
        new RemoteProjectNode('Remote Project (projectKey)')
      ];
    } else if (element.label.indexOf('Project') >= 0) {
      return [
        new WorkspaceFolderNode('workspace-folder-1'),
        new WorkspaceFolderNode('workspace-folder-2')
      ];
    } else {
      return null;
    }
  }

  getParent?(element: any) {
    /*if (!element || element.label.indexOf('My') >= 0) {
      return null;
    } else if(element.label.indexOf('Project') >= 0) {
      return new VSCode.TreeItem('SonarCloud');
    } else if(element.label.indexOf('server') >= 0) {
      return new VSCode.TreeItem('SonarQube');
    } else {
      return null;
    }*/
    return null;
  }

}