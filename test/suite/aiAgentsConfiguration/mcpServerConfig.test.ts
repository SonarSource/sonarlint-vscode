/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import {
  getMCPConfigPath,
  configureMCPServer,
  onEmbeddedServerStarted,
  openMCPServerConfigurationFile
} from '../../../src/aiAgentsConfiguration/mcpServerConfig';
import { getCurrentAgentWithMCPSupport, IntegrationTarget } from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import { AllConnectionsTreeDataProvider, Connection } from '../../../src/connected/connections';
import { ConnectionSettingsService } from '../../../src/settings/connectionsettings';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';
import { Commands } from '../../../src/util/commands';
import { AiIntegration } from '../../../src/lsp/aiIntegrationProtocol';
import { DEFAULT_CONNECTION_ID } from '../../../src/commons';

const mockConnection: Connection = new Connection('test-connection-id', 'Test SonarQube', 'sonarqubeConnection', 'ok');

const getMCPConfigStub = sinon.stub().resolves({
  jsonConfiguration: '{"command": "test-command", "args": ["test-arg"], "env": {}}'
});
const inspectMcpConfigurationStub = sinon.stub();
const planMcpConfigurationUpdateStub = sinon.stub();

const mockLanguageClient = {
  getMCPServerConfiguration: getMCPConfigStub,
  inspectMcpConfiguration: inspectMcpConfigurationStub,
  planMcpConfigurationUpdate: planMcpConfigurationUpdateStub
} as unknown as SonarLintExtendedLanguageClient;

const mockAllConnectionsTreeDataProvider = {
  getConnections: sinon.stub().resolves([mockConnection])
} as unknown as AllConnectionsTreeDataProvider;

suite('mcpServerConfig', () => {
  setup(() => {
    getMCPConfigStub.resetHistory();
    inspectMcpConfigurationStub.reset();
    inspectMcpConfigurationStub.resolves({
      state: AiIntegration.McpConfigurationState.NOT_CONFIGURED,
      diagnostics: []
    });
    planMcpConfigurationUpdateStub.reset();
    planMcpConfigurationUpdateStub.resolves({
      state: AiIntegration.McpConfigurationState.NOT_CONFIGURED,
      updatedContent: '{"planned":true}\n',
      diagnostics: []
    });
  });

  test('should detect supported IDEs based on app name', () => {
    const envStub = sinon.stub(vscode.env, 'appName');
    const extensionsStub = sinon.stub(vscode.extensions, 'getExtension');

    try {
      envStub.value('Cursor');
      expect(getCurrentAgentWithMCPSupport()).to.equal(IntegrationTarget.CURSOR);

      envStub.value('Windsurf');
      expect(getCurrentAgentWithMCPSupport()).to.equal(IntegrationTarget.WINDSURF);

      envStub.value('Kiro');
      expect(getCurrentAgentWithMCPSupport()).to.equal(IntegrationTarget.KIRO);

      envStub.value('Visual Studio Code');
      extensionsStub.withArgs('github.copilot-chat').returns({ isActive: true });
      expect(getCurrentAgentWithMCPSupport()).to.equal(IntegrationTarget.GITHUB_COPILOT);

      envStub.value('Visual Studio Code');
      extensionsStub.withArgs('github.copilot-chat').returns({ isActive: false });
      expect(getCurrentAgentWithMCPSupport()).to.be.undefined;

      envStub.value('Visual Studio Code - Insiders');
      extensionsStub.withArgs('github.copilot-chat').returns({ isActive: true });
      expect(getCurrentAgentWithMCPSupport()).to.equal(IntegrationTarget.GITHUB_COPILOT);

      envStub.value('Unknown IDE');
      extensionsStub.withArgs('github.copilot-chat').returns(undefined);
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

      envStub.value('Kiro');
      const kiroPath = getMCPConfigPath();

      envStub.value('Visual Studio Code');
      extensionsStub.withArgs('github.copilot-chat').returns({ isActive: true });
      const vscodePath = getMCPConfigPath();

      expect(cursorPath).to.not.equal(windsurfPath);
      expect(cursorPath).to.not.equal(kiroPath);
      expect(cursorPath).to.not.equal(vscodePath);
      expect(windsurfPath).to.not.equal(kiroPath);
      expect(windsurfPath).to.not.equal(vscodePath);
      expect(kiroPath).to.not.equal(vscodePath);

      expect(cursorPath).to.include('.cursor');
      expect(windsurfPath).to.include('windsurf');
      expect(kiroPath).to.include('.kiro');
      expect(vscodePath).to.include('Code');

      expect(cursorPath).to.match(/mcp\.json$/);
      expect(windsurfPath).to.match(/mcp_config\.json$/);
      expect(kiroPath).to.match(/mcp\.json$/);
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
      extensionsStub.withArgs('github.copilot-chat').returns(undefined);

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
    const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').returns(new Promise(() => {}));
    const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns('{"inputs": []}');
    const mkdirStub = sinon.stub(fs, 'mkdirSync');
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const globalStateUpdateStub = sinon.stub().resolves();
    const extensionContext = {
      globalState: { update: globalStateUpdateStub }
    } as unknown as vscode.ExtensionContext;

    try {
      await configureMCPServer(
        mockLanguageClient,
        mockAllConnectionsTreeDataProvider,
        extensionContext,
        mockConnection
      );

      expect(connectionServiceStub.calledWith(mockConnection)).to.be.true;
      expect(getMCPConfigStub.calledWith('test-connection-id', 'valid-test-token')).to.be.true;
      expect(planMcpConfigurationUpdateStub.calledOnce).to.be.true;
      expect(planMcpConfigurationUpdateStub.firstCall.args[0].sonarMcpConfiguration).to.equal(
        '{"command": "test-command", "args": ["test-arg"], "env": {}}'
      );
      expect(showInfoStub.called).to.be.true;
      expect(writeFileStub.called).to.be.true;
      expect(globalStateUpdateStub.calledOnce).to.be.true;

      const writeCall = writeFileStub.getCall(0);
      const [filePath, fileContent] = writeCall.args;

      expect(filePath).to.match(/\.cursor[/\\]mcp\.json$/);

      expect(fileContent).to.equal('{"planned":true}\n');
      expect(executeCommandStub.calledWith(Commands.REFRESH_AI_AGENTS_CONFIGURATION)).to.be.false;
    } finally {
      envStub.restore();
      extensionsStub.restore();
      connectionServiceStub.restore();
      showInfoStub.restore();
      executeCommandStub.restore();
      existsStub.restore();
      readFileStub.restore();
      mkdirStub.restore();
      writeFileStub.restore();
    }
  });

  test('should normalize a connection without an ID before generating and persisting its configuration', async () => {
    const defaultConnection = new Connection(
      undefined as unknown as string,
      'Default SonarQube',
      'sonarqubeConnection',
      'ok'
    );
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const connectionServiceStub = sinon
      .stub(ConnectionSettingsService.instance, 'getTokenForConnection')
      .resolves('valid-test-token');
    const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(false);
    const mkdirStub = sinon.stub(fs, 'mkdirSync');
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const globalStateUpdateStub = sinon.stub().resolves();
    const extensionContext = {
      globalState: { update: globalStateUpdateStub }
    } as unknown as vscode.ExtensionContext;

    try {
      await configureMCPServer(
        mockLanguageClient,
        mockAllConnectionsTreeDataProvider,
        extensionContext,
        defaultConnection
      );

      expect(getMCPConfigStub.calledOnceWith(DEFAULT_CONNECTION_ID, 'valid-test-token')).to.be.true;
      expect(inspectMcpConfigurationStub.firstCall.args[0].content).to.be.null;
      expect(planMcpConfigurationUpdateStub.firstCall.args[0].content).to.be.null;
      expect(planMcpConfigurationUpdateStub.firstCall.args[0].sonarMcpConfiguration).to.equal(
        '{"command": "test-command", "args": ["test-arg"], "env": {}}'
      );
      expect(globalStateUpdateStub.firstCall.args[1]).to.deep.equal({
        id: DEFAULT_CONNECTION_ID,
        type: 'sonarqubeConnection'
      });
    } finally {
      envStub.restore();
      connectionServiceStub.restore();
      showInfoStub.restore();
      executeCommandStub.restore();
      existsStub.restore();
      mkdirStub.restore();
      writeFileStub.restore();
    }
  });

  test('should pass existing JSONC through the shared update plan', async () => {
    const existingContent = `{
      // Keep this server
      "mcpServers": { "other": { "command": "other" } }
    }`;
    const updatedContent = '{"mcpServers":{"other":{"command":"other"},"sonarqube":{"command":"docker"}}}\n';
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const connectionServiceStub = sinon
      .stub(ConnectionSettingsService.instance, 'getTokenForConnection')
      .resolves('valid-test-token');
    const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns(existingContent);
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const globalStateUpdateStub = sinon.stub().resolves();
    const extensionContext = {
      globalState: { update: globalStateUpdateStub }
    } as unknown as vscode.ExtensionContext;
    inspectMcpConfigurationStub.resolves({
      state: AiIntegration.McpConfigurationState.NOT_CONFIGURED,
      diagnostics: []
    });
    planMcpConfigurationUpdateStub.resolves({
      state: AiIntegration.McpConfigurationState.NOT_CONFIGURED,
      updatedContent,
      diagnostics: []
    });

    try {
      await configureMCPServer(
        mockLanguageClient,
        mockAllConnectionsTreeDataProvider,
        extensionContext,
        mockConnection
      );

      expect(inspectMcpConfigurationStub.firstCall.args[0].content).to.equal(existingContent);
      expect(planMcpConfigurationUpdateStub.firstCall.args[0].content).to.equal(existingContent);
      expect(writeFileStub.calledOnceWith(sinon.match.string, updatedContent, 'utf8')).to.be.true;
      expect(globalStateUpdateStub.calledOnce).to.be.true;
    } finally {
      envStub.restore();
      connectionServiceStub.restore();
      showInfoStub.restore();
      executeCommandStub.restore();
      existsStub.restore();
      readFileStub.restore();
      writeFileStub.restore();
    }
  });

  test('should plan and write from the MCP file contents after user interaction', async () => {
    const staleContent = '{"mcpServers":{"other":{"command":"stale"}}}';
    const currentContent = '{"mcpServers":{"other":{"command":"current"}}}';
    const updatedContent = '{"mcpServers":{"other":{"command":"current"},"sonarqube":{"command":"docker"}}}\n';
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const connectionServiceStub = sinon
      .stub(ConnectionSettingsService.instance, 'getTokenForConnection')
      .resolves(undefined);
    const showWarningStub = sinon
      .stub(vscode.window, 'showWarningMessage')
      .resolves('Proceed Anyway' as unknown as vscode.MessageItem);
    const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync');
    readFileStub.onFirstCall().returns(staleContent);
    readFileStub.returns(currentContent);
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const globalStateUpdateStub = sinon.stub().resolves();
    const extensionContext = {
      globalState: { update: globalStateUpdateStub }
    } as unknown as vscode.ExtensionContext;
    planMcpConfigurationUpdateStub.resolves({
      state: AiIntegration.McpConfigurationState.NOT_CONFIGURED,
      updatedContent,
      diagnostics: []
    });

    try {
      await configureMCPServer(
        mockLanguageClient,
        mockAllConnectionsTreeDataProvider,
        extensionContext,
        mockConnection
      );

      expect(inspectMcpConfigurationStub.firstCall.args[0].content).to.equal(staleContent);
      expect(planMcpConfigurationUpdateStub.firstCall.args[0].content).to.equal(currentContent);
      expect(writeFileStub.calledOnceWith(sinon.match.string, updatedContent, 'utf8')).to.be.true;
      expect(showWarningStub.calledOnce).to.be.true;
    } finally {
      envStub.restore();
      connectionServiceStub.restore();
      showWarningStub.restore();
      showInfoStub.restore();
      executeCommandStub.restore();
      existsStub.restore();
      readFileStub.restore();
      writeFileStub.restore();
    }
  });

  test('should not update malformed, CLI-managed, or unknown configurations', async () => {
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const showErrorStub = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    const showWarningStub = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns('{ invalid');
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const extensionContext = {
      globalState: { update: sinon.stub().resolves() }
    } as unknown as vscode.ExtensionContext;
    const blockedStates = [
      AiIntegration.McpConfigurationState.MALFORMED,
      AiIntegration.McpConfigurationState.CLI_MANAGED,
      AiIntegration.McpConfigurationState.UNKNOWN
    ];

    try {
      for (const state of blockedStates) {
        inspectMcpConfigurationStub.resolves({ state, diagnostics: ['Configuration was not changed.'] });
        await configureMCPServer(
          mockLanguageClient,
          mockAllConnectionsTreeDataProvider,
          extensionContext,
          mockConnection
        );
      }

      expect(planMcpConfigurationUpdateStub.called).to.be.false;
      expect(writeFileStub.called).to.be.false;
      expect(showErrorStub.calledOnce).to.be.true;
      expect(showWarningStub.callCount).to.equal(2);
    } finally {
      envStub.restore();
      showErrorStub.restore();
      showWarningStub.restore();
      existsStub.restore();
      readFileStub.restore();
      writeFileStub.restore();
    }
  });

  test('should not persist the connection when writing fails', async () => {
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const connectionServiceStub = sinon
      .stub(ConnectionSettingsService.instance, 'getTokenForConnection')
      .resolves('valid-test-token');
    const showErrorStub = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns('{}');
    const writeFileStub = sinon.stub(fs, 'writeFileSync').throws(new Error('write failed'));
    const globalStateUpdateStub = sinon.stub().resolves();
    const extensionContext = {
      globalState: { update: globalStateUpdateStub }
    } as unknown as vscode.ExtensionContext;

    try {
      let failure: Error | undefined;
      try {
        await configureMCPServer(
          mockLanguageClient,
          mockAllConnectionsTreeDataProvider,
          extensionContext,
          mockConnection
        );
      } catch (error) {
        failure = error;
      }

      expect(failure?.message).to.equal('write failed');
      expect(globalStateUpdateStub.called).to.be.false;
    } finally {
      envStub.restore();
      connectionServiceStub.restore();
      showErrorStub.restore();
      existsStub.restore();
      readFileStub.restore();
      writeFileStub.restore();
    }
  });

  test('should update a standalone MCP config when embedded server starts', async () => {
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
    const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    const getServerTokenStub = sinon
      .stub(ConnectionSettingsService.instance, 'getServerToken')
      .resolves('valid-test-token');
    const sonarQubeConnectionsStub = sinon
      .stub(ConnectionSettingsService.instance, 'getSonarQubeConnections')
      .returns([{ serverUrl: 'https://example.com' }]);
    const sonarCloudConnectionsStub = sinon
      .stub(ConnectionSettingsService.instance, 'getSonarCloudConnections')
      .returns([{ organizationKey: 'cloud-organization' }]);
    const extensionContext = {
      globalState: {
        get: sinon.stub().returns({ id: DEFAULT_CONNECTION_ID, type: 'sonarqubeConnection' })
      }
    } as unknown as vscode.ExtensionContext;
    inspectMcpConfigurationStub.resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      diagnostics: []
    });
    const plannedContent =
      '{"mcpServers":{"sonarqube":{"command":"docker","env":{"SONARQUBE_IDE_PORT":"64123"}}}}\n';
    planMcpConfigurationUpdateStub.resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      updatedContent: plannedContent,
      diagnostics: []
    });

    try {
      await onEmbeddedServerStarted(mockLanguageClient, extensionContext);

      expect(writeFileStub.called).to.be.true;
      expect(getServerTokenStub.calledOnceWith('https://example.com')).to.be.true;
      expect(getMCPConfigStub.calledOnceWith(DEFAULT_CONNECTION_ID, 'valid-test-token')).to.be.true;
      expect(planMcpConfigurationUpdateStub.calledOnce).to.be.true;
      expect(planMcpConfigurationUpdateStub.firstCall.args[0].sonarMcpConfiguration).to.equal(
        '{"command": "test-command", "args": ["test-arg"], "env": {}}'
      );
      const writeCall = writeFileStub.getCall(0);
      const [_filePath, fileContent] = writeCall.args;
      expect(fileContent).to.equal(plannedContent);
      expect(executeCommandStub.calledWith(Commands.REFRESH_AI_AGENTS_CONFIGURATION)).to.be.false;
    } finally {
      envStub.restore();
      existsStub.restore();
      readFileStub.restore();
      writeFileStub.restore();
      mkdirStub.restore();
      executeCommandStub.restore();
      getServerTokenStub.restore();
      sonarQubeConnectionsStub.restore();
      sonarCloudConnectionsStub.restore();
    }
  });

  test('should resolve a persisted default connection when settings use an empty connectionId', async () => {
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns('{"mcpServers":{"sonarqube":{}}}');
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const getServerTokenStub = sinon
      .stub(ConnectionSettingsService.instance, 'getServerToken')
      .resolves('valid-test-token');
    const sonarQubeConnectionsStub = sinon
      .stub(ConnectionSettingsService.instance, 'getSonarQubeConnections')
      .returns([{ connectionId: '', serverUrl: 'https://example.com' }]);
    const sonarCloudConnectionsStub = sinon
      .stub(ConnectionSettingsService.instance, 'getSonarCloudConnections')
      .returns([]);
    inspectMcpConfigurationStub.resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      diagnostics: []
    });
    planMcpConfigurationUpdateStub.resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      updatedContent: '{"updated":true}\n',
      diagnostics: []
    });

    try {
      await onEmbeddedServerStarted(mockLanguageClient, {
        globalState: { get: sinon.stub().returns({ id: DEFAULT_CONNECTION_ID, type: 'sonarqubeConnection' }) }
      } as unknown as vscode.ExtensionContext);

      expect(getServerTokenStub.calledOnceWith('https://example.com')).to.be.true;
      expect(getMCPConfigStub.calledOnceWith(DEFAULT_CONNECTION_ID, 'valid-test-token')).to.be.true;
      expect(writeFileStub.calledOnce).to.be.true;
    } finally {
      envStub.restore();
      existsStub.restore();
      readFileStub.restore();
      writeFileStub.restore();
      getServerTokenStub.restore();
      sonarQubeConnectionsStub.restore();
      sonarCloudConnectionsStub.restore();
    }
  });

  test('should not update MCP config when embedded server starts and SonarQube MCP Server is not configured', async () => {
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
      await onEmbeddedServerStarted(mockLanguageClient, {
        globalState: { get: sinon.stub() }
      } as unknown as vscode.ExtensionContext);

      expect(writeFileStub.called).to.be.false;
    } finally {
      envStub.restore();
      existsStub.restore();
      readFileStub.restore();
      writeFileStub.restore();
      mkdirStub.restore();
    }
  });

  test('should persist a standalone configure even when planned content is unchanged', async () => {
    const existingContent = '{"mcpServers":{"sonarqube":{}}}';
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const connectionServiceStub = sinon
      .stub(ConnectionSettingsService.instance, 'getTokenForConnection')
      .resolves('valid-test-token');
    const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns(existingContent);
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const globalStateUpdateStub = sinon.stub().resolves();
    const extensionContext = {
      globalState: { update: globalStateUpdateStub }
    } as unknown as vscode.ExtensionContext;
    inspectMcpConfigurationStub.resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      diagnostics: []
    });
    planMcpConfigurationUpdateStub.resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      updatedContent: existingContent,
      diagnostics: []
    });

    try {
      await configureMCPServer(
        mockLanguageClient,
        mockAllConnectionsTreeDataProvider,
        extensionContext,
        mockConnection
      );

      expect(inspectMcpConfigurationStub.firstCall.args[0].content).to.equal(existingContent);
      expect(planMcpConfigurationUpdateStub.firstCall.args[0].content).to.equal(existingContent);
      expect(writeFileStub.calledOnceWith(sinon.match.string, existingContent, 'utf8')).to.be.true;
      expect(globalStateUpdateStub.calledOnce).to.be.true;
    } finally {
      envStub.restore();
      connectionServiceStub.restore();
      showInfoStub.restore();
      executeCommandStub.restore();
      existsStub.restore();
      readFileStub.restore();
      writeFileStub.restore();
    }
  });

  test('should not write CLI-managed or malformed configs when the embedded server starts', async () => {
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns('{"mcpServers":{}}');
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const getStub = sinon.stub().returns({ id: DEFAULT_CONNECTION_ID, type: 'sonarqubeConnection' });
    const sonarQubeConnectionsStub = sinon
      .stub(ConnectionSettingsService.instance, 'getSonarQubeConnections')
      .returns([{ serverUrl: 'https://example.com' }]);
    const getServerTokenStub = sinon
      .stub(ConnectionSettingsService.instance, 'getServerToken')
      .resolves('valid-test-token');
    const blockedStates = [
      AiIntegration.McpConfigurationState.CLI_MANAGED,
      AiIntegration.McpConfigurationState.MALFORMED
    ];

    try {
      for (const state of blockedStates) {
        inspectMcpConfigurationStub.resolves({ state, diagnostics: ['blocked'] });
        await onEmbeddedServerStarted(mockLanguageClient, {
          globalState: { get: getStub }
        } as unknown as vscode.ExtensionContext);
      }

      expect(planMcpConfigurationUpdateStub.called).to.be.false;
      expect(writeFileStub.called).to.be.false;
    } finally {
      envStub.restore();
      existsStub.restore();
      readFileStub.restore();
      writeFileStub.restore();
      sonarQubeConnectionsStub.restore();
      getServerTokenStub.restore();
    }
  });

  test('should not write when a persisted connection no longer exists', async () => {
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns('{"mcpServers":{"sonarqube":{}}}');
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const sonarQubeConnectionsStub = sinon
      .stub(ConnectionSettingsService.instance, 'getSonarQubeConnections')
      .returns([]);
    const sonarCloudConnectionsStub = sinon
      .stub(ConnectionSettingsService.instance, 'getSonarCloudConnections')
      .returns([]);
    inspectMcpConfigurationStub.resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      diagnostics: []
    });

    try {
      await onEmbeddedServerStarted(mockLanguageClient, {
        globalState: { get: sinon.stub().returns({ id: 'gone', type: 'sonarqubeConnection' }) }
      } as unknown as vscode.ExtensionContext);

      expect(getMCPConfigStub.called).to.be.false;
      expect(writeFileStub.called).to.be.false;
    } finally {
      envStub.restore();
      existsStub.restore();
      readFileStub.restore();
      writeFileStub.restore();
      sonarQubeConnectionsStub.restore();
      sonarCloudConnectionsStub.restore();
    }
  });

  test('should load a named SonarQube Cloud connection token for embedded updates', async () => {
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns('{"mcpServers":{"sonarqube":{}}}');
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const getServerTokenStub = sinon
      .stub(ConnectionSettingsService.instance, 'getServerToken')
      .resolves('cloud-token');
    const sonarQubeConnectionsStub = sinon
      .stub(ConnectionSettingsService.instance, 'getSonarQubeConnections')
      .returns([]);
    const sonarCloudConnectionsStub = sinon
      .stub(ConnectionSettingsService.instance, 'getSonarCloudConnections')
      .returns([{ connectionId: 'cloud-id', organizationKey: 'example-org' }]);
    inspectMcpConfigurationStub.resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      diagnostics: []
    });
    planMcpConfigurationUpdateStub.resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      updatedContent: '{"updated":true}\n',
      diagnostics: []
    });

    try {
      await onEmbeddedServerStarted(mockLanguageClient, {
        globalState: { get: sinon.stub().returns({ id: 'cloud-id', type: 'sonarcloudConnection' }) }
      } as unknown as vscode.ExtensionContext);

      expect(getServerTokenStub.calledOnceWith('example-org')).to.be.true;
      expect(getMCPConfigStub.calledOnceWith('cloud-id', 'cloud-token')).to.be.true;
    } finally {
      envStub.restore();
      existsStub.restore();
      readFileStub.restore();
      writeFileStub.restore();
      getServerTokenStub.restore();
      sonarQubeConnectionsStub.restore();
      sonarCloudConnectionsStub.restore();
    }
  });

  test('should load a named SonarQube Server connection token for embedded updates', async () => {
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns('{"mcpServers":{"sonarqube":{}}}');
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const getServerTokenStub = sinon.stub(ConnectionSettingsService.instance, 'getServerToken').resolves('sq-token');
    const sonarQubeConnectionsStub = sinon
      .stub(ConnectionSettingsService.instance, 'getSonarQubeConnections')
      .returns([{ connectionId: 'sq-id', serverUrl: 'https://sq.example' }]);
    const sonarCloudConnectionsStub = sinon
      .stub(ConnectionSettingsService.instance, 'getSonarCloudConnections')
      .returns([]);
    inspectMcpConfigurationStub.resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      diagnostics: []
    });
    planMcpConfigurationUpdateStub.resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      updatedContent: '{"updated":true}\n',
      diagnostics: []
    });

    try {
      await onEmbeddedServerStarted(mockLanguageClient, {
        globalState: { get: sinon.stub().returns({ id: 'sq-id', type: 'sonarqubeConnection' }) }
      } as unknown as vscode.ExtensionContext);

      expect(getServerTokenStub.calledOnceWith('https://sq.example')).to.be.true;
      expect(getMCPConfigStub.calledOnceWith('sq-id', 'sq-token')).to.be.true;
    } finally {
      envStub.restore();
      existsStub.restore();
      readFileStub.restore();
      writeFileStub.restore();
      getServerTokenStub.restore();
      sonarQubeConnectionsStub.restore();
      sonarCloudConnectionsStub.restore();
    }
  });

  test('should open the exact detected MCP configuration file', async () => {
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument').resolves();

    try {
      await openMCPServerConfigurationFile();
      expect(showTextDocumentStub.calledOnce).to.be.true;
      expect(showTextDocumentStub.firstCall.args[0].fsPath).to.match(/\.cursor[/\\]mcp\.json$/);
    } finally {
      envStub.restore();
      existsStub.restore();
      showTextDocumentStub.restore();
    }
  });

  test('should tell the user when the MCP configuration file is missing', async () => {
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(false);
    const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument').resolves();

    try {
      await openMCPServerConfigurationFile();
      expect(showInfoStub.calledOnce).to.be.true;
      expect(showTextDocumentStub.called).to.be.false;
    } finally {
      envStub.restore();
      existsStub.restore();
      showInfoStub.restore();
      showTextDocumentStub.restore();
    }
  });
});
