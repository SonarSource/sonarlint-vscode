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
  migrateLegacyMCPConnection,
  onEmbeddedServerStarted,
  supportsStandaloneMCP
} from '../../../src/aiAgentsConfiguration/mcpServerConfig';
import * as aiAgentUtils from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import {
  getCurrentIntegrationTargetWithMCPSupport,
  INTEGRATION_TARGET
} from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import { AllConnectionsTreeDataProvider, Connection } from '../../../src/connected/connections';
import { ConnectionSettingsService } from '../../../src/settings/connectionsettings';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';
import { AiIntegrationService } from '../../../src/aiAgentsConfiguration/aiIntegrationService';
import { ExtendedServer } from '../../../src/lsp/protocol';
import { DEFAULT_CONNECTION_ID } from '../../../src/commons';

const mockConnection: Connection = new Connection('test-connection-id', 'Test SonarQube', 'sonarqubeConnection', 'ok');

const getMCPConfigStub = sinon.stub().resolves({
  jsonConfiguration: '{"command": "test-command", "args": ["test-arg"], "env": {}}'
});

const mockLanguageClient = {
  getMCPServerConfiguration: getMCPConfigStub
} as unknown as SonarLintExtendedLanguageClient;

const inspectMcpConfigurationStub = sinon.stub();
const planMcpConfigurationUpdateStub = sinon.stub();
const mockAiIntegrationService = {
  inspectMcpConfiguration: inspectMcpConfigurationStub,
  planMcpConfigurationUpdate: planMcpConfigurationUpdateStub
} as unknown as AiIntegrationService;

const mockAllConnectionsTreeDataProvider = {
  getConnections: sinon.stub().resolves([mockConnection])
} as unknown as AllConnectionsTreeDataProvider;

suite('mcpServerConfig', () => {
  setup(() => {
    getMCPConfigStub.resetHistory();
    inspectMcpConfigurationStub.reset();
    inspectMcpConfigurationStub.resolves({
      state: ExtendedServer.McpConfigurationState.NOT_CONFIGURED,
      diagnostics: []
    });
    planMcpConfigurationUpdateStub.reset();
    planMcpConfigurationUpdateStub.resolves({
      state: ExtendedServer.McpConfigurationState.NOT_CONFIGURED,
      updatedContent: '{"planned":true}\n',
      diagnostics: []
    });
  });

  test('should detect supported IDEs based on app name', () => {
    const envStub = sinon.stub(vscode.env, 'appName');
    const extensionsStub = sinon.stub(vscode.extensions, 'getExtension');

    try {
      envStub.value('Cursor');
      expect(getCurrentIntegrationTargetWithMCPSupport()).to.equal(INTEGRATION_TARGET.CURSOR);

      envStub.value('Windsurf');
      expect(getCurrentIntegrationTargetWithMCPSupport()).to.equal(INTEGRATION_TARGET.WINDSURF);

      envStub.value('Kiro');
      expect(getCurrentIntegrationTargetWithMCPSupport()).to.equal(INTEGRATION_TARGET.KIRO);

      envStub.value('Visual Studio Code');
      extensionsStub.withArgs('github.copilot-chat').returns({ isActive: true });
      expect(getCurrentIntegrationTargetWithMCPSupport()).to.equal(INTEGRATION_TARGET.GITHUB_COPILOT);

      envStub.value('Visual Studio Code');
      extensionsStub.withArgs('github.copilot-chat').returns({ isActive: false });
      expect(getCurrentIntegrationTargetWithMCPSupport()).to.be.undefined;

      envStub.value('Visual Studio Code - Insiders');
      extensionsStub.withArgs('github.copilot-chat').returns({ isActive: true });
      expect(getCurrentIntegrationTargetWithMCPSupport()).to.equal(INTEGRATION_TARGET.GITHUB_COPILOT);

      envStub.value('Unknown IDE');
      extensionsStub.withArgs('github.copilot-chat').returns(undefined);
      expect(getCurrentIntegrationTargetWithMCPSupport()).to.be.undefined;
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
      const cursorPath = getMCPConfigPath(INTEGRATION_TARGET.CURSOR);

      envStub.value('Windsurf');
      const windsurfPath = getMCPConfigPath(INTEGRATION_TARGET.WINDSURF);

      envStub.value('Kiro');
      const kiroPath = getMCPConfigPath(INTEGRATION_TARGET.KIRO);

      envStub.value('Visual Studio Code');
      extensionsStub.withArgs('github.copilot-chat').returns({ isActive: true });
      const vscodePath = getMCPConfigPath(INTEGRATION_TARGET.GITHUB_COPILOT);
      const claudePath = getMCPConfigPath(INTEGRATION_TARGET.CLAUDE_CODE);

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
      expect(claudePath).to.match(/\.claude\.json$/);
      expect(supportsStandaloneMCP(INTEGRATION_TARGET.CODEX)).to.be.false;
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

      expect(() => getMCPConfigPath(INTEGRATION_TARGET.CODEX)).to.throw('Standalone MCP is not supported');
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
    const globalStateUpdateStub = sinon.stub().resolves();
    const extensionContext = {
      globalState: { get: sinon.stub(), update: globalStateUpdateStub }
    } as unknown as vscode.ExtensionContext;

    try {
      await configureMCPServer(
        mockLanguageClient,
        mockAiIntegrationService,
        mockAllConnectionsTreeDataProvider,
        extensionContext,
        INTEGRATION_TARGET.CURSOR,
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
      expect(globalStateUpdateStub.firstCall.args[0]).to.equal(
        `aiAgentsConfiguration.mcpConnection.${INTEGRATION_TARGET.CURSOR}`
      );

      const writeCall = writeFileStub.getCall(0);
      const [filePath, fileContent] = writeCall.args;

      expect(filePath).to.match(/\.cursor[/\\]mcp\.json$/);

      expect(fileContent).to.equal('{"planned":true}\n');
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

  test('should ask which agent to configure when the public command has multiple detected agents', async () => {
    const detectedAgentsStub = sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([
      { id: INTEGRATION_TARGET.CURSOR, name: 'Cursor', source: 'builtIn' },
      { id: INTEGRATION_TARGET.CLAUDE_CODE, name: 'Claude Code', source: 'extension' }
    ]);
    const quickPickStub = sinon.stub(vscode.window, 'showQuickPick').callsFake(async items => (await items)[1]);
    const connectionServiceStub = sinon
      .stub(ConnectionSettingsService.instance, 'getTokenForConnection')
      .resolves('valid-test-token');
    const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(false);
    const mkdirStub = sinon.stub(fs, 'mkdirSync');
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const extensionContext = {
      globalState: { get: sinon.stub(), update: sinon.stub().resolves() }
    } as unknown as vscode.ExtensionContext;

    try {
      await configureMCPServer(
        mockLanguageClient,
        mockAiIntegrationService,
        mockAllConnectionsTreeDataProvider,
        extensionContext,
        undefined,
        mockConnection
      );

      expect(quickPickStub.calledOnce).to.be.true;
      expect(planMcpConfigurationUpdateStub.firstCall.args[0].agent).to.equal(ExtendedServer.AiAgent.CLAUDE_CODE);
      expect(writeFileStub.firstCall.args[0]).to.match(/\.claude\.json$/);
    } finally {
      detectedAgentsStub.restore();
      quickPickStub.restore();
      connectionServiceStub.restore();
      showInfoStub.restore();
      executeCommandStub.restore();
      existsStub.restore();
      mkdirStub.restore();
      writeFileStub.restore();
    }
  });

  test('should reject a requested agent that is not detected in this IDE', async () => {
    const detectedAgentsStub = sinon
      .stub(aiAgentUtils, 'getDetectedIdeAgents')
      .returns([{ id: INTEGRATION_TARGET.CLAUDE_CODE, name: 'Claude Code', source: 'extension' }]);
    const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const extensionContext = {
      globalState: { get: sinon.stub(), update: sinon.stub().resolves() }
    } as unknown as vscode.ExtensionContext;

    try {
      await configureMCPServer(
        mockLanguageClient,
        mockAiIntegrationService,
        mockAllConnectionsTreeDataProvider,
        extensionContext,
        INTEGRATION_TARGET.KIRO,
        mockConnection
      );

      expect(inspectMcpConfigurationStub.called).to.be.false;
      expect(planMcpConfigurationUpdateStub.called).to.be.false;
      expect(showInfoStub.calledOnceWith('Kiro was not detected in this IDE.')).to.be.true;
    } finally {
      detectedAgentsStub.restore();
      showInfoStub.restore();
    }
  });

  test('should allow only one MCP setup at a time', async () => {
    let finishInspection: (inspection: ExtendedServer.McpConfigurationInspectionResponse) => void;
    inspectMcpConfigurationStub.returns(
      new Promise<ExtendedServer.McpConfigurationInspectionResponse>(resolve => (finishInspection = resolve))
    );
    const detectedAgentsStub = sinon
      .stub(aiAgentUtils, 'getDetectedIdeAgents')
      .returns([{ id: INTEGRATION_TARGET.CURSOR, name: 'Cursor', source: 'builtIn' }]);
    const connectionServiceStub = sinon
      .stub(ConnectionSettingsService.instance, 'getTokenForConnection')
      .resolves('valid-test-token');
    const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(false);
    const mkdirStub = sinon.stub(fs, 'mkdirSync');
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const extensionContext = {
      globalState: { get: sinon.stub(), update: sinon.stub().resolves() }
    } as unknown as vscode.ExtensionContext;

    try {
      const firstSetup = configureMCPServer(
        mockLanguageClient,
        mockAiIntegrationService,
        mockAllConnectionsTreeDataProvider,
        extensionContext,
        INTEGRATION_TARGET.CURSOR,
        mockConnection
      );
      await Promise.resolve();
      await configureMCPServer(
        mockLanguageClient,
        mockAiIntegrationService,
        mockAllConnectionsTreeDataProvider,
        extensionContext,
        INTEGRATION_TARGET.CURSOR,
        mockConnection
      );

      expect(inspectMcpConfigurationStub.calledOnce).to.be.true;
      finishInspection({ state: ExtendedServer.McpConfigurationState.NOT_CONFIGURED, diagnostics: [] });
      await firstSetup;
      expect(writeFileStub.calledOnce).to.be.true;
    } finally {
      detectedAgentsStub.restore();
      connectionServiceStub.restore();
      showInfoStub.restore();
      executeCommandStub.restore();
      existsStub.restore();
      mkdirStub.restore();
      writeFileStub.restore();
    }
  });

  test('should not configure standalone MCP in a remote IDE window', async () => {
    const remoteNameStub = sinon.stub(vscode.env, 'remoteName').value('ssh-remote');
    const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);

    try {
      await configureMCPServer(
        mockLanguageClient,
        mockAiIntegrationService,
        mockAllConnectionsTreeDataProvider,
        { globalState: { get: sinon.stub(), update: sinon.stub().resolves() } } as unknown as vscode.ExtensionContext,
        INTEGRATION_TARGET.CURSOR,
        mockConnection
      );

      expect(inspectMcpConfigurationStub.called).to.be.false;
      expect(showInfoStub.calledOnceWith('Standalone MCP setup is not available in remote IDE windows.')).to.be.true;
    } finally {
      remoteNameStub.restore();
      showInfoStub.restore();
    }
  });

  test('should not start interactive setup while standalone configurations are refreshing', async () => {
    let finishInspection: (inspection: ExtendedServer.McpConfigurationInspectionResponse) => void;
    inspectMcpConfigurationStub.returns(
      new Promise<ExtendedServer.McpConfigurationInspectionResponse>(resolve => (finishInspection = resolve))
    );
    const detectedAgentsStub = sinon
      .stub(aiAgentUtils, 'getDetectedIdeAgents')
      .returns([{ id: INTEGRATION_TARGET.CURSOR, name: 'Cursor', source: 'builtIn' }]);
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns('{}');
    const extensionContext = {
      globalState: { get: sinon.stub(), update: sinon.stub().resolves() }
    } as unknown as vscode.ExtensionContext;

    try {
      const refresh = onEmbeddedServerStarted(mockLanguageClient, mockAiIntegrationService, extensionContext);
      await Promise.resolve();
      await configureMCPServer(
        mockLanguageClient,
        mockAiIntegrationService,
        mockAllConnectionsTreeDataProvider,
        extensionContext,
        INTEGRATION_TARGET.CURSOR,
        mockConnection
      );

      expect(inspectMcpConfigurationStub.calledOnce).to.be.true;
      finishInspection({ state: ExtendedServer.McpConfigurationState.NOT_CONFIGURED, diagnostics: [] });
      await refresh;
      expect(planMcpConfigurationUpdateStub.called).to.be.false;
    } finally {
      detectedAgentsStub.restore();
      existsStub.restore();
      readFileStub.restore();
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
      globalState: { get: sinon.stub(), update: globalStateUpdateStub }
    } as unknown as vscode.ExtensionContext;

    try {
      await configureMCPServer(
        mockLanguageClient,
        mockAiIntegrationService,
        mockAllConnectionsTreeDataProvider,
        extensionContext,
        INTEGRATION_TARGET.CURSOR,
        defaultConnection
      );

      expect(getMCPConfigStub.calledOnceWith(DEFAULT_CONNECTION_ID, 'valid-test-token')).to.be.true;
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

  test('should preserve existing JSONC through the shared update plan and create a backup', async () => {
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
    const copyFileStub = sinon.stub(fs, 'copyFileSync');
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const globalStateUpdateStub = sinon.stub().resolves();
    const extensionContext = {
      globalState: { get: sinon.stub(), update: globalStateUpdateStub }
    } as unknown as vscode.ExtensionContext;
    inspectMcpConfigurationStub.resolves({
      state: ExtendedServer.McpConfigurationState.NOT_CONFIGURED,
      diagnostics: []
    });
    planMcpConfigurationUpdateStub.resolves({
      state: ExtendedServer.McpConfigurationState.NOT_CONFIGURED,
      updatedContent,
      diagnostics: []
    });

    try {
      await configureMCPServer(
        mockLanguageClient,
        mockAiIntegrationService,
        mockAllConnectionsTreeDataProvider,
        extensionContext,
        INTEGRATION_TARGET.CURSOR,
        mockConnection
      );

      expect(inspectMcpConfigurationStub.firstCall.args[0].content).to.equal(existingContent);
      expect(planMcpConfigurationUpdateStub.firstCall.args[0].content).to.equal(existingContent);
      expect(copyFileStub.calledOnce).to.be.true;
      expect(copyFileStub.firstCall.args[1]).to.match(/mcp\.json\.bak$/);
      expect(writeFileStub.calledOnceWith(sinon.match.string, updatedContent, 'utf8')).to.be.true;
      expect(globalStateUpdateStub.calledOnce).to.be.true;
    } finally {
      envStub.restore();
      connectionServiceStub.restore();
      showInfoStub.restore();
      executeCommandStub.restore();
      existsStub.restore();
      readFileStub.restore();
      copyFileStub.restore();
      writeFileStub.restore();
    }
  });

  test('should not update malformed, CLI-managed, legacy, or unknown configurations', async () => {
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const showErrorStub = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    const showWarningStub = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns('{ invalid');
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const extensionContext = {
      globalState: { get: sinon.stub(), update: sinon.stub().resolves() }
    } as unknown as vscode.ExtensionContext;
    const blockedStates = [
      ExtendedServer.McpConfigurationState.MALFORMED,
      ExtendedServer.McpConfigurationState.CLI_MANAGED,
      ExtendedServer.McpConfigurationState.LEGACY,
      ExtendedServer.McpConfigurationState.UNKNOWN
    ];

    try {
      for (const state of blockedStates) {
        inspectMcpConfigurationStub.resolves({ state, diagnostics: ['Configuration was not changed.'] });
        await configureMCPServer(
          mockLanguageClient,
          mockAiIntegrationService,
          mockAllConnectionsTreeDataProvider,
          extensionContext,
          INTEGRATION_TARGET.CURSOR,
          mockConnection
        );
      }

      expect(planMcpConfigurationUpdateStub.called).to.be.false;
      expect(writeFileStub.called).to.be.false;
      expect(showErrorStub.calledOnce).to.be.true;
      expect(showWarningStub.callCount).to.equal(3);
    } finally {
      envStub.restore();
      showErrorStub.restore();
      showWarningStub.restore();
      existsStub.restore();
      readFileStub.restore();
      writeFileStub.restore();
    }
  });

  test('should retain the backup and not persist the connection when writing fails', async () => {
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const connectionServiceStub = sinon
      .stub(ConnectionSettingsService.instance, 'getTokenForConnection')
      .resolves('valid-test-token');
    const showErrorStub = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns('{}');
    const copyFileStub = sinon.stub(fs, 'copyFileSync');
    const writeFileStub = sinon.stub(fs, 'writeFileSync').throws(new Error('write failed'));
    const globalStateUpdateStub = sinon.stub().resolves();
    const extensionContext = {
      globalState: { get: sinon.stub(), update: globalStateUpdateStub }
    } as unknown as vscode.ExtensionContext;

    try {
      let failure: Error | undefined;
      try {
        await configureMCPServer(
          mockLanguageClient,
          mockAiIntegrationService,
          mockAllConnectionsTreeDataProvider,
          extensionContext,
          INTEGRATION_TARGET.CURSOR,
          mockConnection
        );
      } catch (error) {
        failure = error;
      }

      expect(failure?.message).to.equal('write failed');
      expect(copyFileStub.calledOnce).to.be.true;
      expect(globalStateUpdateStub.called).to.be.false;
    } finally {
      envStub.restore();
      connectionServiceStub.restore();
      showErrorStub.restore();
      existsStub.restore();
      readFileStub.restore();
      copyFileStub.restore();
      writeFileStub.restore();
    }
  });

  test('should update every standalone MCP config with its own saved connection when embedded server starts', async () => {
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
    const detectedAgentsStub = sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([
      { id: INTEGRATION_TARGET.CURSOR, name: 'Cursor', source: 'builtIn' },
      { id: INTEGRATION_TARGET.CLAUDE_CODE, name: 'Claude Code', source: 'extension' },
      { id: INTEGRATION_TARGET.CODEX, name: 'Codex', source: 'extension' }
    ]);

    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns(JSON.stringify(existingConfig));
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const mkdirStub = sinon.stub(fs, 'mkdirSync');
    const copyFileStub = sinon.stub(fs, 'copyFileSync');
    const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    const connectionServiceStub = sinon
      .stub(ConnectionSettingsService.instance, 'getTokenForConnection')
      .callsFake(async connection =>
        connection.contextValue === 'sonarqubeConnection' ? 'server-token' : 'cloud-token'
      );
    const sonarQubeConnectionsStub = sinon
      .stub(ConnectionSettingsService.instance, 'getSonarQubeConnections')
      .returns([{ serverUrl: 'https://example.com' }]);
    const sonarCloudConnectionsStub = sinon
      .stub(ConnectionSettingsService.instance, 'getSonarCloudConnections')
      .returns([{ connectionId: 'cloud-connection', organizationKey: 'cloud-organization' }]);
    const globalStateGetStub = sinon.stub();
    globalStateGetStub
      .withArgs(`aiAgentsConfiguration.mcpConnection.${INTEGRATION_TARGET.CURSOR}`)
      .returns({ id: DEFAULT_CONNECTION_ID, type: 'sonarqubeConnection' });
    globalStateGetStub
      .withArgs(`aiAgentsConfiguration.mcpConnection.${INTEGRATION_TARGET.CLAUDE_CODE}`)
      .returns({ id: 'cloud-connection', type: 'sonarcloudConnection' });
    const extensionContext = {
      globalState: {
        get: globalStateGetStub,
        update: sinon.stub().resolves()
      }
    } as unknown as vscode.ExtensionContext;
    inspectMcpConfigurationStub.resolves({
      state: ExtendedServer.McpConfigurationState.STANDALONE,
      diagnostics: []
    });
    planMcpConfigurationUpdateStub.resolves({
      state: ExtendedServer.McpConfigurationState.STANDALONE,
      updatedContent: '{"updatedBySlls":true}\n',
      diagnostics: []
    });

    try {
      await onEmbeddedServerStarted(mockLanguageClient, mockAiIntegrationService, extensionContext);

      expect(writeFileStub.callCount).to.equal(2);
      expect(writeFileStub.firstCall.args[0]).to.match(/\.cursor[/\\]mcp\.json$/);
      expect(writeFileStub.secondCall.args[0]).to.match(/\.claude\.json$/);
      expect(copyFileStub.callCount).to.equal(2);
      expect(connectionServiceStub.callCount).to.equal(2);
      expect(getMCPConfigStub.callCount).to.equal(2);
      expect(getMCPConfigStub.calledWith(DEFAULT_CONNECTION_ID, 'server-token')).to.be.true;
      expect(getMCPConfigStub.calledWith('cloud-connection', 'cloud-token')).to.be.true;
      expect(planMcpConfigurationUpdateStub.callCount).to.equal(2);
      const writeCall = writeFileStub.getCall(0);
      const [_filePath, fileContent] = writeCall.args;
      expect(fileContent).to.equal('{"updatedBySlls":true}\n');
    } finally {
      envStub.restore();
      existsStub.restore();
      readFileStub.restore();
      writeFileStub.restore();
      mkdirStub.restore();
      copyFileStub.restore();
      executeCommandStub.restore();
      connectionServiceStub.restore();
      sonarQubeConnectionsStub.restore();
      sonarCloudConnectionsStub.restore();
      detectedAgentsStub.restore();
    }
  });

  test('should migrate legacy connection metadata only to the previous host-specific target', async () => {
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const legacyConnection = { id: 'legacy', type: 'sonarqubeConnection' };
    const storedValues = new Map<string, unknown>([['aiAgentsConfiguration.mcpConnection', legacyConnection]]);
    const update = sinon.stub().callsFake(async (key: string, value: unknown) => {
      if (value === undefined) {
        storedValues.delete(key);
      } else {
        storedValues.set(key, value);
      }
    });
    const extensionContext = {
      globalState: {
        get: (key: string) => storedValues.get(key),
        update
      }
    } as unknown as vscode.ExtensionContext;

    try {
      await migrateLegacyMCPConnection(extensionContext);

      expect(storedValues.get(`aiAgentsConfiguration.mcpConnection.${INTEGRATION_TARGET.CURSOR}`)).to.deep.equal(
        legacyConnection
      );
      expect(storedValues.has(`aiAgentsConfiguration.mcpConnection.${INTEGRATION_TARGET.CLAUDE_CODE}`)).to.be.false;
      expect(storedValues.has('aiAgentsConfiguration.mcpConnection')).to.be.false;
    } finally {
      envStub.restore();
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
      await onEmbeddedServerStarted(mockLanguageClient, mockAiIntegrationService, {
        globalState: { get: sinon.stub(), update: sinon.stub().resolves() }
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
});
