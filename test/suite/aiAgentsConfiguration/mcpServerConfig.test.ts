/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { getMCPConfigPath, configureMCPServer, onEmbeddedServerStarted } from '../../../src/aiAgentsConfiguration/mcpServerConfig';
import { getCurrentAgentWithMCPSupport, AGENT } from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import { AllConnectionsTreeDataProvider, Connection } from '../../../src/connected/connections';
import { ConnectionSettingsService } from '../../../src/settings/connectionsettings';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';

const mockConnection: Connection = new Connection('test-connection-id', 'Test SonarQube', 'sonarqubeConnection', 'ok');

const getMCPConfigStub = sinon.stub().resolves({
  jsonConfiguration: '{"command": "test-command", "args": ["test-arg"], "env": {}}'
});

const mockLanguageClient = ({
  getMCPServerConfiguration: getMCPConfigStub
} as unknown) as SonarLintExtendedLanguageClient;

const mockAllConnectionsTreeDataProvider = ({
  getConnections: sinon.stub().resolves([mockConnection])
} as unknown as AllConnectionsTreeDataProvider);

suite('mcpServerConfig', () => {
  test('should detect supported IDEs based on app name', () => {
    const envStub = sinon.stub(vscode.env, 'appName');
    const extensionsStub = sinon.stub(vscode.extensions, 'getExtension');

    try {
      envStub.value('Cursor');
      expect(getCurrentAgentWithMCPSupport()).to.equal(AGENT.CURSOR);

      envStub.value('Windsurf');
      expect(getCurrentAgentWithMCPSupport()).to.equal(AGENT.WINDSURF);

      envStub.value('Visual Studio Code');
      extensionsStub.withArgs('GitHub.copilot').returns({ isActive: true });
      expect(getCurrentAgentWithMCPSupport()).to.equal(AGENT.GITHUB_COPILOT);

      envStub.value('Visual Studio Code');
      extensionsStub.withArgs('GitHub.copilot').returns({ isActive: false });
      expect(getCurrentAgentWithMCPSupport()).to.be.undefined;

      envStub.value('Visual Studio Code - Insiders');
      extensionsStub.withArgs('GitHub.copilot').returns({ isActive: true });
      expect(getCurrentAgentWithMCPSupport()).to.equal(AGENT.GITHUB_COPILOT);

      envStub.value('Unknown IDE');
      extensionsStub.withArgs('GitHub.copilot').returns(undefined);
      expect(getCurrentAgentWithMCPSupport()).to.be.undefined;
    } finally {
      envStub.restore();
      extensionsStub.restore();
    }
  });

  test('should return different config paths for different IDEs', () => {
    const envStub = sinon.stub(vscode.env, 'appName');
    const extensionsStub = sinon.stub(vscode.extensions, 'getExtension');

    try {
      envStub.value('Cursor');
      const cursorPath = getMCPConfigPath();

      envStub.value('Windsurf');
      const windsurfPath = getMCPConfigPath();

      envStub.value('Visual Studio Code');
      extensionsStub.withArgs('GitHub.copilot').returns({ isActive: true });
      const vscodePath = getMCPConfigPath();

      expect(cursorPath).to.not.equal(windsurfPath);
      expect(cursorPath).to.not.equal(vscodePath);
      expect(windsurfPath).to.not.equal(vscodePath);

      expect(cursorPath).to.include('.cursor');
      expect(windsurfPath).to.include('windsurf');
      expect(vscodePath).to.include('Code');

      expect(cursorPath).to.match(/mcp\.json$/);
      expect(windsurfPath).to.match(/mcp_config\.json$/);
      expect(vscodePath).to.match(/mcp\.json$/);
    } finally {
      envStub.restore();
      extensionsStub.restore();
    }
  });

  test('should throw error for unsupported agent', () => {
    const envStub = sinon.stub(vscode.env, 'appName');
    const extensionsStub = sinon.stub(vscode.extensions, 'getExtension');

    try {
      envStub.value('Unsupported agent');
      extensionsStub.withArgs('GitHub.copilot').returns(undefined);

      expect(() => getMCPConfigPath()).to.throw('Unsupported agent');
    } finally {
      envStub.restore();
      extensionsStub.restore();
    }
  });

  test('should configure MCP server for connection with valid token', async () => {
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const extensionsStub = sinon.stub(vscode.extensions, 'getExtension');
    const connectionServiceStub = sinon
      .stub(ConnectionSettingsService.instance, 'getTokenForConnection')
      .resolves('valid-test-token');
    const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();

    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(false);
    const mkdirStub = sinon.stub(fs, 'mkdirSync');
    const writeFileStub = sinon.stub(fs, 'writeFileSync');

      try {
        await configureMCPServer(mockLanguageClient, mockAllConnectionsTreeDataProvider, mockConnection);

        expect(connectionServiceStub.calledWith(mockConnection)).to.be.true;
        expect(getMCPConfigStub.calledWith('test-connection-id', 'valid-test-token')).to.be.true;
        expect(showInfoStub.called).to.be.true;
        expect(writeFileStub.called).to.be.true;

        const writeCall = writeFileStub.getCall(0);
        const [filePath, fileContent] = writeCall.args;

        expect(filePath).to.match(/\.cursor[/\\]mcp\.json$/);

        const writtenConfig = JSON.parse(fileContent);
        expect(writtenConfig).to.have.property('mcpServers');
        expect(writtenConfig.mcpServers).to.have.property('sonarqube');
        expect(writtenConfig.mcpServers.sonarqube.command).to.equal('test-command');
        expect(writtenConfig.mcpServers.sonarqube.args).to.deep.equal(['test-arg']);
    } finally {
      envStub.restore();
      extensionsStub.restore();
      connectionServiceStub.restore();
      showInfoStub.restore();
      executeCommandStub.restore();
      existsStub.restore();
      mkdirStub.restore();
      writeFileStub.restore();
    }
  });

  test('should update MCP config with new port when embedded server starts', () => {
    const existingConfig = {
      mcpServers: {
        sonarqube: {
          command: 'test-command',
          args: ['test-arg'],
          env: {
            SONARQUBE_IDE_PORT: '62120'
          }
        }
      }
    };

    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns(JSON.stringify(existingConfig));
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const mkdirStub = sinon.stub(fs, 'mkdirSync');

    try {
      onEmbeddedServerStarted(62127);

      expect(writeFileStub.called).to.be.true;
      
      const writeCall = writeFileStub.getCall(0);
      const [_filePath, fileContent] = writeCall.args;
      const updatedConfig = JSON.parse(fileContent);
      
      expect(updatedConfig.mcpServers.sonarqube.env.SONARQUBE_IDE_PORT).to.equal('62127');

    } finally { 
      envStub.restore();
      existsStub.restore();
      readFileStub.restore();
      writeFileStub.restore();
      mkdirStub.restore();
    }
  });

  test('should not update MCP config when embedded server starts and SonarQube MCP Server is not configured', () => {
    const existingConfig = {
      mcpServers: {
        git: {
          command: 'test-command',
          args: ['test-arg']
        }
      }
    };

    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns(JSON.stringify(existingConfig));
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const mkdirStub = sinon.stub(fs, 'mkdirSync');

    try {
      onEmbeddedServerStarted(62127);

      expect(writeFileStub.called).to.be.false;
      
    } finally { 
      envStub.restore();
      existsStub.restore();
      readFileStub.restore();
      writeFileStub.restore();
      mkdirStub.restore();
    }
  });
});
