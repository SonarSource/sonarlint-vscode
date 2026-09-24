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
  getActiveMcpAgent,
  getMCPConfigPath,
  configureMCPServer,
  onEmbeddedServerStarted,
  openMCPServerConfigurationFile,
  getStandaloneMCPAgents
} from '../../../src/aiAgentsConfiguration/mcpServerConfig';
import { getCurrentAgentWithMCPSupport, IntegrationTarget } from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import * as aiAgentUtils from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import { AllConnectionsTreeDataProvider, Connection } from '../../../src/connected/connections';
import { ConnectionSettingsService } from '../../../src/settings/connectionsettings';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';
import { Commands } from '../../../src/util/commands';
import { AiIntegration } from '../../../src/lsp/aiIntegrationProtocol';
import { DEFAULT_CONNECTION_ID } from '../../../src/commons';
import * as logging from '../../../src/util/logging';

const mockConnection: Connection = new Connection('test-connection-id', 'Test SonarQube', 'sonarqubeConnection', 'ok');

const getMCPConfigStub = sinon.stub().resolves({
  jsonConfiguration: '{"command": "test-command", "args": ["test-arg"], "env": {}}'
});
const inspectMcpConfigurationStub = sinon.stub();
const getAiIntegrationStateStub = sinon.stub();
const planMcpConfigurationUpdateStub = sinon.stub();

const mockLanguageClient = {
  getMCPServerConfiguration: getMCPConfigStub,
  getAiIntegrationState: getAiIntegrationStateStub,
  inspectMcpConfiguration: inspectMcpConfigurationStub,
  planMcpConfigurationUpdate: planMcpConfigurationUpdateStub
} as unknown as SonarLintExtendedLanguageClient;

const mockAllConnectionsTreeDataProvider = {
  getConnections: sinon.stub().resolves([mockConnection])
} as unknown as AllConnectionsTreeDataProvider;

suite('mcpServerConfig', () => {
  setup(() => {
    getAiIntegrationStateStub.reset();
    getAiIntegrationStateStub.callsFake(async () => ({
      agents: aiAgentUtils.getDetectedIdeAgents().map(agent => ({
        agent: agent.id,
        detectionSources: [AiIntegration.AiAgentDetectionSource.IDE],
        standaloneMcpSupported: true,
        cliIntegrationSupported: true,
        hookSupported: false,
        skillSupported: false
      }))
    }));
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
      const cursorPath = getMCPConfigPath(IntegrationTarget.CURSOR);

      envStub.value('Windsurf');
      const windsurfPath = getMCPConfigPath(IntegrationTarget.WINDSURF);

      envStub.value('Kiro');
      const kiroPath = getMCPConfigPath(IntegrationTarget.KIRO);

      envStub.value('Visual Studio Code');
      extensionsStub.withArgs('github.copilot-chat').returns({ isActive: true });
      const vscodePath = getMCPConfigPath(IntegrationTarget.GITHUB_COPILOT);

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

      expect(() => getMCPConfigPath(AiIntegration.AiAgent.CODEX)).to.throw('Standalone MCP is not supported');
    } finally {
      envStub.restore();
      extensionsStub.restore();
    }
  });

  test('should report an interactive setup blocked by a startup refresh', async () => {
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const detectedAgentsStub = sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([]);
    const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    let finishMigration: () => void;
    const migration = new Promise<void>(resolve => (finishMigration = resolve));
    const update = sinon.stub();
    update.onFirstCall().returns(migration);
    update.onSecondCall().resolves();
    const get = sinon.stub();
    get.onFirstCall().returns({ id: DEFAULT_CONNECTION_ID, type: 'sonarqubeConnection' });
    get.onSecondCall().returns(undefined);
    const extensionContext = { globalState: { get, update } } as unknown as vscode.ExtensionContext;

    try {
      const startupRefresh = onEmbeddedServerStarted(mockLanguageClient, extensionContext);
      await configureMCPServer(
        mockLanguageClient,
        mockAllConnectionsTreeDataProvider,
        extensionContext,
        IntegrationTarget.CURSOR,
        mockConnection
      );

      expect(
        showInfoStub.calledOnceWith(
          'A SonarQube MCP configuration operation is already running. Try again in a moment.'
        )
      ).to.be.true;
      finishMigration();
      await startupRefresh;
    } finally {
      envStub.restore();
      detectedAgentsStub.restore();
      showInfoStub.restore();
    }
  });

  test('should refresh every detected agent after an embedded-server event during setup', async () => {
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const detectedAgentsStub = sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([
      { id: AiIntegration.AiAgent.CURSOR, name: 'Cursor', source: 'builtIn' },
      { id: AiIntegration.AiAgent.CLAUDE_CODE, name: 'Claude Code', source: 'extension' }
    ]);
    let releaseToken: (token: string) => void;
    let tokenRequested: () => void;
    const token = new Promise<string>(resolve => (releaseToken = resolve));
    const tokenRequest = new Promise<void>(resolve => (tokenRequested = resolve));
    const tokenStub = sinon.stub(ConnectionSettingsService.instance, 'getTokenForConnection').callsFake(() => {
      tokenRequested();
      return token;
    });
    const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns('{}');
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const extensionContext = {
      globalState: { get: sinon.stub().returns(undefined), update: sinon.stub().resolves() }
    } as unknown as vscode.ExtensionContext;

    try {
      const setup = configureMCPServer(
        mockLanguageClient,
        mockAllConnectionsTreeDataProvider,
        extensionContext,
        AiIntegration.AiAgent.CURSOR,
        mockConnection
      );
      await tokenRequest;
      await onEmbeddedServerStarted(mockLanguageClient, extensionContext);
      expect(inspectMcpConfigurationStub.calledOnce).to.be.true;

      releaseToken('valid-test-token');
      await setup;

      expect(inspectMcpConfigurationStub.callCount).to.equal(3);
      expect(inspectMcpConfigurationStub.getCalls().map(call => call.args[0].agent)).to.deep.equal([
        AiIntegration.AiAgent.CURSOR,
        AiIntegration.AiAgent.CURSOR,
        AiIntegration.AiAgent.CLAUDE_CODE
      ]);
      expect(executeCommandStub.calledWith(Commands.REFRESH_AI_AGENTS_CONFIGURATION)).to.be.true;
    } finally {
      envStub.restore();
      detectedAgentsStub.restore();
      tokenStub.restore();
      showInfoStub.restore();
      executeCommandStub.restore();
      existsStub.restore();
      readFileStub.restore();
      writeFileStub.restore();
    }
  });

  test('should log startup refresh failures without rejecting', async () => {
    const logStub = sinon.stub(logging, 'logToSonarLintOutput');
    const extensionContext = {
      globalState: {
        get: sinon.stub().throws(new Error('storage failed')),
        update: sinon.stub().resolves()
      }
    } as unknown as vscode.ExtensionContext;

    try {
      await onEmbeddedServerStarted(mockLanguageClient, extensionContext);

      expect(logStub.calledWith('Could not refresh the standalone SonarQube MCP configurations: storage failed')).to
        .be.true;
    } finally {
      logStub.restore();
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
      globalState: { get: sinon.stub(), update: globalStateUpdateStub }
    } as unknown as vscode.ExtensionContext;

    try {
      await configureMCPServer(
        mockLanguageClient,
        mockAllConnectionsTreeDataProvider,
        extensionContext,
        IntegrationTarget.CURSOR,
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
      expect(executeCommandStub.calledWith(Commands.REFRESH_AI_AGENTS_CONFIGURATION)).to.be.true;
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
      globalState: { get: sinon.stub(), update: globalStateUpdateStub }
    } as unknown as vscode.ExtensionContext;

    try {
      await configureMCPServer(
        mockLanguageClient,
        mockAllConnectionsTreeDataProvider,
        extensionContext,
        IntegrationTarget.CURSOR,
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
      globalState: { get: sinon.stub(), update: globalStateUpdateStub }
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
        IntegrationTarget.CURSOR,
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

  test('does not write when the update plan reclassifies an initially safe file', async () => {
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const tokenStub = sinon
      .stub(ConnectionSettingsService.instance, 'getTokenForConnection')
      .resolves('valid-test-token');
    const showErrorStub = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    const showWarningStub = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns('{"mcpServers":{}}');
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const globalStateUpdateStub = sinon.stub().resolves();
    const extensionContext = {
      globalState: { get: sinon.stub().returns(undefined), update: globalStateUpdateStub }
    } as unknown as vscode.ExtensionContext;

    try {
      for (const state of [
        AiIntegration.McpConfigurationState.CLI_MANAGED,
        AiIntegration.McpConfigurationState.MALFORMED
      ]) {
        planMcpConfigurationUpdateStub.resolves({
          state,
          updatedContent: null,
          diagnostics: ['Configuration changed.']
        });
        await configureMCPServer(
          mockLanguageClient,
          mockAllConnectionsTreeDataProvider,
          extensionContext,
          AiIntegration.AiAgent.CURSOR,
          mockConnection
        );
      }

      expect(inspectMcpConfigurationStub.callCount).to.equal(2);
      expect(planMcpConfigurationUpdateStub.callCount).to.equal(2);
      expect(writeFileStub.called).to.be.false;
      expect(globalStateUpdateStub.called).to.be.false;
      expect(showWarningStub.calledOnce).to.be.true;
      expect(showErrorStub.calledOnce).to.be.true;
    } finally {
      envStub.restore();
      tokenStub.restore();
      showErrorStub.restore();
      showWarningStub.restore();
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
      globalState: { get: sinon.stub(), update: sinon.stub().resolves() }
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
          IntegrationTarget.CURSOR,
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
      globalState: { get: sinon.stub(), update: globalStateUpdateStub }
    } as unknown as vscode.ExtensionContext;

    try {
      let failure: Error | undefined;
      try {
        await configureMCPServer(
          mockLanguageClient,
          mockAllConnectionsTreeDataProvider,
          extensionContext,
          IntegrationTarget.CURSOR,
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
      .returns([{ connectionId: '', serverUrl: 'https://example.com' }]);
    const sonarCloudConnectionsStub = sinon
      .stub(ConnectionSettingsService.instance, 'getSonarCloudConnections')
      .returns([{ organizationKey: 'cloud-organization' }]);
    const extensionContext = {
      globalState: {
        get: sinon.stub().returns({ id: DEFAULT_CONNECTION_ID, type: 'sonarqubeConnection' }),
        update: sinon.stub().resolves()
      }
    } as unknown as vscode.ExtensionContext;
    inspectMcpConfigurationStub.resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      diagnostics: []
    });
    const plannedContent = '{"mcpServers":{"sonarqube":{"command":"docker","env":{"SONARQUBE_IDE_PORT":"64123"}}}}\n';
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
      expect(executeCommandStub.calledWith(Commands.REFRESH_AI_AGENTS_CONFIGURATION)).to.be.true;
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

  test('persists connection metadata without rewriting unchanged planned content', async () => {
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
      globalState: { get: sinon.stub(), update: globalStateUpdateStub }
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
        IntegrationTarget.CURSOR,
        mockConnection
      );

      expect(inspectMcpConfigurationStub.firstCall.args[0].content).to.equal(existingContent);
      expect(planMcpConfigurationUpdateStub.firstCall.args[0].content).to.equal(existingContent);
      expect(writeFileStub.called).to.be.false;
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

  test('should not write non-standalone configs when the embedded server starts', async () => {
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns('{"mcpServers":{}}');
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const extensionContext = { globalState: { get: sinon.stub() } } as unknown as vscode.ExtensionContext;
    const blockedStates = [
      AiIntegration.McpConfigurationState.NOT_CONFIGURED,
      AiIntegration.McpConfigurationState.CLI_MANAGED,
      AiIntegration.McpConfigurationState.UNKNOWN,
      AiIntegration.McpConfigurationState.MALFORMED
    ];

    try {
      for (const state of blockedStates) {
        inspectMcpConfigurationStub.resolves({ state, diagnostics: ['blocked'] });
        await onEmbeddedServerStarted(mockLanguageClient, extensionContext);
      }

      expect(planMcpConfigurationUpdateStub.called).to.be.false;
      expect(writeFileStub.called).to.be.false;
    } finally {
      envStub.restore();
      existsStub.restore();
      readFileStub.restore();
      writeFileStub.restore();
    }
  });

  test('should report a setup that is already running', async () => {
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const showErrorStub = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    let releaseInspection = (_inspection: AiIntegration.McpConfigurationInspectionResponse) => undefined;
    inspectMcpConfigurationStub.returns(
      new Promise(resolve => {
        releaseInspection = resolve;
      })
    );
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(false);
    const extensionContext = {
      globalState: { get: sinon.stub(), update: sinon.stub().resolves() }
    } as unknown as vscode.ExtensionContext;

    try {
      const firstSetup = configureMCPServer(
        mockLanguageClient,
        mockAllConnectionsTreeDataProvider,
        extensionContext,
        IntegrationTarget.CURSOR,
        mockConnection
      );
      await configureMCPServer(
        mockLanguageClient,
        mockAllConnectionsTreeDataProvider,
        extensionContext,
        IntegrationTarget.CURSOR,
        mockConnection
      );

      expect(
        showInfoStub.calledOnceWith(
          'A SonarQube MCP configuration operation is already running. Try again in a moment.'
        )
      ).to.be.true;
      expect(planMcpConfigurationUpdateStub.called).to.be.false;
      releaseInspection({
        state: AiIntegration.McpConfigurationState.MALFORMED,
        diagnostics: ['blocked']
      });
      await firstSetup;
      expect(showErrorStub.calledOnce).to.be.true;
      expect(getActiveMcpAgent()).to.be.undefined;
    } finally {
      envStub.restore();
      showInfoStub.restore();
      showErrorStub.restore();
      executeCommandStub.restore();
      existsStub.restore();
    }
  });

  test('should record the agent chosen from the quick pick while setup is running', async () => {
    const detectedAgentsStub = sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([
      { id: AiIntegration.AiAgent.CURSOR, name: 'Cursor', source: 'builtIn' },
      { id: AiIntegration.AiAgent.CLAUDE_CODE, name: 'Claude Code', source: 'extension' }
    ]);
    let resolvePick: (selection: { agent: AiIntegration.AiAgent } | undefined) => void;
    const showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick').callsFake(() => {
      return new Promise(resolve => {
        resolvePick = resolve;
      });
    });
    const showErrorStub = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    let releaseInspection = (_inspection: AiIntegration.McpConfigurationInspectionResponse) => undefined;
    inspectMcpConfigurationStub.returns(
      new Promise(resolve => {
        releaseInspection = resolve;
      })
    );
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns('{}');
    const extensionContext = {
      globalState: { get: sinon.stub(), update: sinon.stub().resolves() }
    } as unknown as vscode.ExtensionContext;

    try {
      const setup = configureMCPServer(
        mockLanguageClient,
        mockAllConnectionsTreeDataProvider,
        extensionContext,
        undefined,
        mockConnection
      );
      await new Promise(resolve => setImmediate(resolve));
      resolvePick({ agent: AiIntegration.AiAgent.CLAUDE_CODE });
      await new Promise(resolve => setImmediate(resolve));

      expect(getActiveMcpAgent()).to.equal(AiIntegration.AiAgent.CLAUDE_CODE);
      expect(executeCommandStub.calledWith(Commands.REFRESH_AI_AGENTS_CONFIGURATION)).to.be.true;
      releaseInspection({
        state: AiIntegration.McpConfigurationState.MALFORMED,
        diagnostics: ['blocked']
      });
      await setup;
      expect(getActiveMcpAgent()).to.be.undefined;
    } finally {
      detectedAgentsStub.restore();
      showQuickPickStub.restore();
      showErrorStub.restore();
      executeCommandStub.restore();
      existsStub.restore();
      readFileStub.restore();
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
        globalState: {
          get: sinon.stub().returns({ id: 'gone', type: 'sonarqubeConnection' }),
          update: sinon.stub().resolves()
        }
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

  test('should load a named connection token for embedded updates', async () => {
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns('{"mcpServers":{"sonarqube":{}}}');
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const getServerTokenStub = sinon.stub(ConnectionSettingsService.instance, 'getServerToken');
    const sonarQubeConnectionsStub = sinon.stub(ConnectionSettingsService.instance, 'getSonarQubeConnections');
    const sonarCloudConnectionsStub = sinon.stub(ConnectionSettingsService.instance, 'getSonarCloudConnections');
    inspectMcpConfigurationStub.resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      diagnostics: []
    });
    planMcpConfigurationUpdateStub.resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      updatedContent: '{"updated":true}\n',
      diagnostics: []
    });
    const connections = [
      {
        persisted: { id: 'cloud-id', type: 'sonarcloudConnection' },
        token: 'cloud-token',
        tokenKey: 'example-org',
        sonarQube: [],
        sonarCloud: [{ connectionId: 'cloud-id', organizationKey: 'example-org' }]
      },
      {
        persisted: { id: 'sq-id', type: 'sonarqubeConnection' },
        token: 'sq-token',
        tokenKey: 'https://sq.example',
        sonarQube: [{ connectionId: 'sq-id', serverUrl: 'https://sq.example' }],
        sonarCloud: []
      }
    ];

    try {
      for (const connection of connections) {
        getServerTokenStub.resetHistory();
        getMCPConfigStub.resetHistory();
        getServerTokenStub.resolves(connection.token);
        sonarQubeConnectionsStub.returns(connection.sonarQube);
        sonarCloudConnectionsStub.returns(connection.sonarCloud);
        await onEmbeddedServerStarted(mockLanguageClient, {
          globalState: {
            get: sinon.stub().returns(connection.persisted),
            update: sinon.stub().resolves()
          }
        } as unknown as vscode.ExtensionContext);

        expect(getServerTokenStub.calledOnceWith(connection.tokenKey)).to.be.true;
        expect(getMCPConfigStub.calledOnceWith(connection.persisted.id, connection.token)).to.be.true;
      }
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

  test('configures a CLI-only Claude Code target with the existing standalone adapter', async () => {
    const agent = AiIntegration.AiAgent.CLAUDE_CODE;
    getAiIntegrationStateStub.resolves({
      agents: [{
        agent,
        detectionSources: [AiIntegration.AiAgentDetectionSource.CLI],
        standaloneMcpSupported: true,
        cliIntegrationSupported: true,
        hookSupported: false,
        skillSupported: false
      }]
    });
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(false);
    const mkdirStub = sinon.stub(fs, 'mkdirSync');
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const tokenStub = sinon.stub(ConnectionSettingsService.instance, 'getTokenForConnection').resolves('token');
    const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').returns(new Promise(() => {}));
    const update = sinon.stub().resolves();
    const context = {
      globalState: { get: sinon.stub(), update }
    } as unknown as vscode.ExtensionContext;

    try {
      await configureMCPServer(mockLanguageClient, mockAllConnectionsTreeDataProvider, context, agent, mockConnection);

      expect(getAiIntegrationStateStub.firstCall.args[0].discoverLocalAgentClis).to.be.true;
      expect(inspectMcpConfigurationStub.calledOnceWith({ agent, content: null })).to.be.true;
      expect(writeFileStub.calledOnce).to.be.true;
      expect(writeFileStub.firstCall.args[0]).to.equal(getMCPConfigPath(agent));
      expect(update.calledOnce).to.be.true;
    } finally {
      existsStub.restore();
      mkdirStub.restore();
      writeFileStub.restore();
      tokenStub.restore();
      showInfoStub.restore();
    }
  });

  test('rejects a stale or unsupported standalone MCP target before reading its file', async () => {
    getAiIntegrationStateStub.resolves({
      agents: [{
        agent: AiIntegration.AiAgent.CODEX,
        detectionSources: [AiIntegration.AiAgentDetectionSource.CLI],
        standaloneMcpSupported: false,
        cliIntegrationSupported: true,
        hookSupported: false,
        skillSupported: false
      }]
    });
    const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const context = {
      globalState: { get: sinon.stub(), update: sinon.stub().resolves() }
    } as unknown as vscode.ExtensionContext;

    try {
      await configureMCPServer(
        mockLanguageClient,
        mockAllConnectionsTreeDataProvider,
        context,
        AiIntegration.AiAgent.CODEX,
        mockConnection
      );
      await configureMCPServer(
        mockLanguageClient,
        mockAllConnectionsTreeDataProvider,
        context,
        AiIntegration.AiAgent.CLAUDE_CODE,
        mockConnection
      );

      expect(inspectMcpConfigurationStub.called).to.be.false;
      expect(planMcpConfigurationUpdateStub.called).to.be.false;
      expect(showInfoStub.calledTwice).to.be.true;
    } finally {
      showInfoStub.restore();
    }
  });

  test('sets the MCP command context from CLI discovery without a server-started notification', async () => {
    getAiIntegrationStateStub.resolves({
      agents: [{
        agent: AiIntegration.AiAgent.CLAUDE_CODE,
        detectionSources: [AiIntegration.AiAgentDetectionSource.CLI],
        standaloneMcpSupported: true,
        cliIntegrationSupported: true,
        hookSupported: false,
        skillSupported: false
      }]
    });
    const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();

    try {
      await getStandaloneMCPAgents(mockLanguageClient);

      expect(executeCommandStub.calledWithExactly('setContext', 'sonarqube.mcpServerSupportedAgent', true)).to.be.true;
    } finally {
      executeCommandStub.restore();
    }
  });

  test('retains the MCP command context after a transient discovery failure', async () => {
    getAiIntegrationStateStub.resolves({
      agents: [{
        agent: AiIntegration.AiAgent.CLAUDE_CODE,
        detectionSources: [AiIntegration.AiAgentDetectionSource.CLI],
        standaloneMcpSupported: true,
        cliIntegrationSupported: true,
        hookSupported: false,
        skillSupported: false
      }]
    });
    const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    const logStub = sinon.stub(logging, 'logToSonarLintOutput');

    try {
      await getStandaloneMCPAgents(mockLanguageClient);
      getAiIntegrationStateStub.rejects(new Error('Temporary backend failure'));

      await onEmbeddedServerStarted(mockLanguageClient, {
        globalState: { get: sinon.stub().returns(undefined) }
      } as unknown as vscode.ExtensionContext);

      expect(executeCommandStub.calledWithExactly('setContext', 'sonarqube.mcpServerSupportedAgent', true)).to.be.true;
      expect(executeCommandStub.calledWithExactly('setContext', 'sonarqube.mcpServerSupportedAgent', false)).to.be.false;
      expect(logStub.calledOnce).to.be.true;
    } finally {
      executeCommandStub.restore();
      logStub.restore();
    }
  });

  test('refreshes a CLI-only standalone MCP configuration after server startup', async () => {
    const agent = AiIntegration.AiAgent.CLAUDE_CODE;
    getAiIntegrationStateStub.resolves({
      agents: [{
        agent,
        detectionSources: [AiIntegration.AiAgentDetectionSource.CLI],
        standaloneMcpSupported: true,
        cliIntegrationSupported: true,
        hookSupported: false,
        skillSupported: false
      }]
    });
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const readFileStub = sinon.stub(fs, 'readFileSync').returns('{"mcpServers":{"sonarqube":{}}}');
    const writeFileStub = sinon.stub(fs, 'writeFileSync');
    const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    const tokenStub = sinon.stub(ConnectionSettingsService.instance, 'getServerToken').resolves('token');
    const connectionsStub = sinon.stub(ConnectionSettingsService.instance, 'getSonarQubeConnections')
      .returns([{ serverUrl: 'https://example.com' }]);
    const get = sinon.stub();
    get.withArgs(`aiAgentsConfiguration.mcpConnection.${agent}`).returns({
      id: DEFAULT_CONNECTION_ID,
      type: 'sonarqubeConnection'
    });
    const context = {
      globalState: { get, update: sinon.stub().resolves() }
    } as unknown as vscode.ExtensionContext;
    inspectMcpConfigurationStub.resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      diagnostics: []
    });
    planMcpConfigurationUpdateStub.resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      updatedContent: '{"mcpServers":{"sonarqube":{"updated":true}}}',
      diagnostics: []
    });

    try {
      await onEmbeddedServerStarted(mockLanguageClient, context);

      expect(writeFileStub.calledOnce).to.be.true;
      expect(writeFileStub.firstCall.args[0]).to.equal(getMCPConfigPath(agent));
      expect(executeCommandStub.calledWithExactly('setContext', 'sonarqube.mcpServerSupportedAgent', true)).to.be.true;
      expect(executeCommandStub.calledWith(Commands.REFRESH_AI_AGENTS_CONFIGURATION)).to.be.true;
    } finally {
      existsStub.restore();
      readFileStub.restore();
      writeFileStub.restore();
      executeCommandStub.restore();
      tokenStub.restore();
      connectionsStub.restore();
    }
  });

  test('keeps the MCP menu disabled when detected agents lack standalone support', async () => {
    getAiIntegrationStateStub.resolves({
      agents: [{
        agent: AiIntegration.AiAgent.CODEX,
        detectionSources: [AiIntegration.AiAgentDetectionSource.CLI],
        standaloneMcpSupported: false,
        cliIntegrationSupported: true,
        hookSupported: false,
        skillSupported: false
      }]
    });
    const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);

    try {
      await openMCPServerConfigurationFile(mockLanguageClient, AiIntegration.AiAgent.CODEX);

      expect(executeCommandStub.calledWithExactly('setContext', 'sonarqube.mcpServerSupportedAgent', false)).to.be.true;
    } finally {
      executeCommandStub.restore();
      showInfoStub.restore();
    }
  });

  test('opens a CLI-only Claude Code configuration file', async () => {
    const agent = AiIntegration.AiAgent.CLAUDE_CODE;
    getAiIntegrationStateStub.resolves({
      agents: [{
        agent,
        detectionSources: [AiIntegration.AiAgentDetectionSource.CLI],
        standaloneMcpSupported: true,
        cliIntegrationSupported: true,
        hookSupported: false,
        skillSupported: false
      }]
    });
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument').resolves();

    try {
      await openMCPServerConfigurationFile(mockLanguageClient, agent);

      expect(showTextDocumentStub.calledOnce).to.be.true;
      expect(showTextDocumentStub.firstCall.args[0].fsPath).to.equal(getMCPConfigPath(agent));
    } finally {
      existsStub.restore();
      showTextDocumentStub.restore();
    }
  });

  test('should open the exact detected MCP configuration file', async () => {
    const envStub = sinon.stub(vscode.env, 'appName').value('Cursor');
    const fs = require('node:fs');
    const existsStub = sinon.stub(fs, 'existsSync').returns(true);
    const showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument').resolves();

    try {
      await openMCPServerConfigurationFile(mockLanguageClient);
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
      await openMCPServerConfigurationFile(mockLanguageClient);
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
