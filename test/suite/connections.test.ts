/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import {expect} from 'chai';
import {
  AllConnectionsTreeDataProvider,
  getConnections
} from "../../src/connections";
import {describe, beforeEach} from 'mocha';

suite('Connected Mode Test Suite', () => {
  beforeEach(async () => {
    // start from scratch config
    await vscode.workspace.getConfiguration('sonarlint')
        .update('connectedMode.connections.sonarqube', undefined, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('sonarlint')
        .update('connectedMode.connections.sonarcloud', undefined, vscode.ConfigurationTarget.Global)
  })

  teardown(async () => {
    await vscode.workspace.getConfiguration('sonarlint')
        .update('connectedMode.connections.sonarqube', undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  describe('getConnections()', () => {

    test('should return same number of sonarqube settings as in config file', () => {
      const connectionConfig = vscode.workspace.getConfiguration('sonarlint.connectedMode.connections')
      expect(connectionConfig.sonarqube.length).to.equal(getConnections('sonarqube').length);
    });

    test('should return no sq/sc connections when config is blank', async () => {
      expect(getConnections('sonarqube').length).to.equal(0);
      expect(getConnections('sonarcloud').length).to.equal(0);
    });

    test('should return same number of sonarcloud settings as in config file', () => {
      const connectionConfig = vscode.workspace.getConfiguration('sonarlint.connectedMode.connections')
      expect(connectionConfig.sonarcloud.length).to.equal(getConnections('sonarcloud').length);
    });

  });

  describe('ConnectedMode TreeView', () => {
    test('should initialise empty tree with SonarQube and SonarCloud collapsed children', () => {
      const underTest = new AllConnectionsTreeDataProvider();

      const children = underTest.getChildren(null);

      expect(children).to.have.lengthOf(2);
      expect(children[0].label).to.equal('SonarQube');
      expect(children[1].label).to.equal('SonarCloud');
      expect(children[0].collapsibleState).to.equal(vscode.TreeItemCollapsibleState.Collapsed);
      expect(children[1].label).to.equal('SonarCloud');
      expect(children[1].collapsibleState).to.equal(vscode.TreeItemCollapsibleState.Collapsed);
    })

    test('should return empty lists when expanding SQ and SC tabs and no connections exist', async () => {
      const underTest = new AllConnectionsTreeDataProvider();

      const initialChildren = underTest.getChildren(null);
      const sonarQubeChildren = underTest.getChildren(initialChildren[0]);
      const sonarCloudChildren = underTest.getChildren(initialChildren[1]);

      expect(sonarQubeChildren.length).to.equal(0);
      expect(sonarCloudChildren.length).to.equal(0);
    })

    test('should return singleton list when expanding SQ and one connection exists', async () => {
      const testSQConfig = [
        { "serverUrl": "https://sonarqube.mycompany.com", "token": "<generated from SonarQube account/security page>" }
      ]
      await vscode.workspace.getConfiguration('sonarlint')
          .update('connectedMode.connections.sonarqube', testSQConfig, vscode.ConfigurationTarget.Global);

      const underTest = new AllConnectionsTreeDataProvider();

      const initialChildren = underTest.getChildren(null);
      const sonarQubeChildren = underTest.getChildren(initialChildren[0]);

      expect(sonarQubeChildren.length).to.equal(1);
      expect(sonarQubeChildren[0].label).to.equal(testSQConfig[0].serverUrl)
    })

    test('should return two element list when expanding SC and two connections exist', async () => {
      const testSCConfig = [
        { "organizationKey": "myOrg1", "token": "ggggg" },
        { "organizationKey": "myOrg2", "token": "ddddd" }
      ]
      await vscode.workspace.getConfiguration('sonarlint')
          .update('connectedMode.connections.sonarcloud', testSCConfig, vscode.ConfigurationTarget.Global);

      const underTest = new AllConnectionsTreeDataProvider();

      const initialChildren = underTest.getChildren(null);
      const sonarCloudChildren = underTest.getChildren(initialChildren[1]);

      expect(sonarCloudChildren.length).to.equal(2);
      expect(sonarCloudChildren[0].label).to.equal(testSCConfig[0].organizationKey)
      expect(sonarCloudChildren[1].label).to.equal(testSCConfig[1].organizationKey)
    })
  })
});