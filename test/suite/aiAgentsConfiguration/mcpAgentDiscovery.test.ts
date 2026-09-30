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
  configureMCPServer,
  getMCPConfigPath,
  getStandaloneMCPAgents,
  onEmbeddedServerStarted,
  openMCPServerConfigurationFile
} from '../../../src/aiAgentsConfiguration/mcpServerConfig';
import { AllConnectionsTreeDataProvider, Connection } from '../../../src/connected/connections';
import { ConnectionSettingsService } from '../../../src/settings/connectionsettings';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';
import { Commands } from '../../../src/util/commands';
import { AiIntegration } from '../../../src/lsp/aiIntegrationProtocol';
import * as logging from '../../../src/util/logging';

const mockConnection = new Connection('test-connection-id', 'Test SonarQube', 'sonarqubeConnection', 'ok');
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

suite('MCP agent discovery', () => {
  setup(() => {
    getMCPConfigStub.resetHistory();
    getAiIntegrationStateStub.reset();
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

  teardown(() => sinon.restore());

  test('rejects a stale or unsupported standalone MCP target before reading its file', async () => {
    getAiIntegrationStateStub.resolves({
      agents: [
        {
          agent: AiIntegration.AiAgent.CODEX,
          detectionSources: [AiIntegration.AiAgentDetectionSource.CLI],
          standaloneMcpSupported: false,
          cliIntegrationSupported: true,
          hookSupported: false,
          skillSupported: false
        }
      ]
    });
    const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);

    try {
      await configureMCPServer(
        mockLanguageClient,
        mockAllConnectionsTreeDataProvider,
        AiIntegration.AiAgent.CODEX,
        mockConnection
      );
      await configureMCPServer(
        mockLanguageClient,
        mockAllConnectionsTreeDataProvider,
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
      agents: [
        {
          agent: AiIntegration.AiAgent.CLAUDE_CODE,
          detectionSources: [AiIntegration.AiAgentDetectionSource.CLI],
          standaloneMcpSupported: true,
          cliIntegrationSupported: true,
          hookSupported: false,
          skillSupported: false
        }
      ]
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
      agents: [
        {
          agent: AiIntegration.AiAgent.CLAUDE_CODE,
          detectionSources: [AiIntegration.AiAgentDetectionSource.CLI],
          standaloneMcpSupported: true,
          cliIntegrationSupported: true,
          hookSupported: false,
          skillSupported: false
        }
      ]
    });
    const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    const logStub = sinon.stub(logging, 'logToSonarLintOutput');

    try {
      await getStandaloneMCPAgents(mockLanguageClient);
      getAiIntegrationStateStub.rejects(new Error('Temporary backend failure'));

      await onEmbeddedServerStarted(mockLanguageClient, 64121);

      expect(executeCommandStub.calledWithExactly('setContext', 'sonarqube.mcpServerSupportedAgent', true)).to.be.true;
      expect(executeCommandStub.calledWithExactly('setContext', 'sonarqube.mcpServerSupportedAgent', false)).to.be
        .false;
      expect(logStub.calledOnce).to.be.true;
    } finally {
      executeCommandStub.restore();
      logStub.restore();
    }
  });

  test('refreshes a CLI-only standalone MCP configuration after server startup', async () => {
    const agent = AiIntegration.AiAgent.CLAUDE_CODE;
    getAiIntegrationStateStub.resolves({
      agents: [
        {
          agent,
          detectionSources: [AiIntegration.AiAgentDetectionSource.CLI],
          standaloneMcpSupported: true,
          cliIntegrationSupported: true,
          hookSupported: false,
          skillSupported: false
        }
      ]
    });
    const existsFileStub = sinon.stub(require('node:fs'), 'existsSync').returns(true);
    const readFileStub = sinon
      .stub(require('node:fs'), 'readFileSync')
      .returns('{"mcpServers":{"sonarqube":{"command":"docker"}}}');
    const writeFileStub = sinon.stub(require('node:fs'), 'writeFileSync');
    const mkdirStub = sinon.stub(require('node:fs'), 'mkdirSync');
    const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    const tokenStub = sinon
      .stub(ConnectionSettingsService.instance, 'getServerToken')
      .throws(new Error('Unexpected token lookup'));
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
      await onEmbeddedServerStarted(mockLanguageClient, 64121);

      expect(writeFileStub.calledOnce).to.be.true;
      expect(writeFileStub.firstCall.args[0]).to.equal(getMCPConfigPath(agent));
      expect(tokenStub.called).to.be.false;
      expect(getMCPConfigStub.called).to.be.false;
      expect(executeCommandStub.calledWithExactly('setContext', 'sonarqube.mcpServerSupportedAgent', true)).to.be.true;
      expect(executeCommandStub.calledWith(Commands.REFRESH_AI_AGENTS_CONFIGURATION)).to.be.true;
    } finally {
      existsFileStub.restore();
      readFileStub.restore();
      writeFileStub.restore();
      mkdirStub.restore();
      executeCommandStub.restore();
      tokenStub.restore();
    }
  });

  test('keeps the MCP menu disabled when detected agents lack standalone support', async () => {
    getAiIntegrationStateStub.resolves({
      agents: [
        {
          agent: AiIntegration.AiAgent.CODEX,
          detectionSources: [AiIntegration.AiAgentDetectionSource.CLI],
          standaloneMcpSupported: false,
          cliIntegrationSupported: true,
          hookSupported: false,
          skillSupported: false
        }
      ]
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
});
