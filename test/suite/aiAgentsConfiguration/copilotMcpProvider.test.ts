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
  COPILOT_MCP_PROVIDER_ID,
  isCopilotMcpProviderConfigured,
  isCopilotMcpProviderRegistered,
  registerCopilotMcpProvider,
  setCopilotMcpConnection
} from '../../../src/aiAgentsConfiguration/copilotMcpProvider';
import {
  configureMCPServer,
  getMCPConfigurationLocation,
  inspectMCPConfiguration,
  onEmbeddedServerStarted,
  openMCPServerConfigurationFile,
  supportsStandaloneMCP
} from '../../../src/aiAgentsConfiguration/mcpServerConfig';
import * as aiAgentUtils from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import { AllConnectionsTreeDataProvider, Connection } from '../../../src/connected/connections';
import { ConnectionSettingsService } from '../../../src/settings/connectionsettings';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';
import { AiIntegration } from '../../../src/lsp/aiIntegrationProtocol';
import { DEFAULT_CONNECTION_ID } from '../../../src/commons';
import * as logging from '../../../src/util/logging';

type McpProvider = vscode.McpServerDefinitionProvider<vscode.McpStdioServerDefinition>;

const LAUNCH_CONFIGURATION = {
  command: 'docker',
  args: ['run', '-i', '--rm', 'sonarsource/sonarqube-mcp'],
  env: { SONARQUBE_URL: 'https://sonar.example.com', SONARQUBE_TOKEN: 'secret', SONARQUBE_IDE_PORT: '64121' }
};

function memento(): vscode.Memento {
  const values = new Map<string, unknown>();
  return {
    keys: () => [...values.keys()],
    get: (key: string, defaultValue?: unknown) => (values.has(key) ? values.get(key) : defaultValue),
    update: async (key: string, value: unknown) => {
      values.set(key, value);
    }
  } as vscode.Memento;
}

suite('Copilot MCP server provider', () => {
  const agent = AiIntegration.AiAgent.GITHUB_COPILOT;
  const connection = new Connection('test-connection', 'Test SonarQube', 'sonarqubeConnection', 'ok');
  let context: vscode.ExtensionContext;
  let client: SonarLintExtendedLanguageClient;
  let connections: AllConnectionsTreeDataProvider;
  let register: sinon.SinonStub;
  let generate: sinon.SinonStub;
  let plan: sinon.SinonStub;
  let token: sinon.SinonStub;
  let sonarQubeConnections: sinon.SinonStub;
  let write: sinon.SinonStub;
  let commands: sinon.SinonStub;
  let remoteName: sinon.SinonStub;
  let configurationChanged: (event: vscode.ConfigurationChangeEvent) => void;

  function registeredProvider(): McpProvider {
    return register.firstCall.args[1] as McpProvider;
  }

  setup(() => {
    remoteName = sinon.stub(vscode.env, 'remoteName').value('dev-container');
    sinon.stub(aiAgentUtils, 'isAgentActiveForMcp').returns(true);
    register = sinon.stub(vscode.lm, 'registerMcpServerDefinitionProvider').returns(new vscode.Disposable(() => {}));
    generate = sinon.stub().resolves({ jsonConfiguration: JSON.stringify(LAUNCH_CONFIGURATION) });
    plan = sinon.stub();
    client = {
      getAiIntegrationState: sinon.stub().resolves({
        agents: [
          {
            agent,
            detectionSources: [AiIntegration.AiAgentDetectionSource.IDE],
            standaloneMcpSupported: true,
            cliIntegrationSupported: false
          }
        ]
      }),
      inspectMcpConfiguration: sinon
        .stub()
        .resolves({ state: AiIntegration.McpConfigurationState.NOT_CONFIGURED, diagnostics: [] }),
      getMCPServerConfiguration: generate,
      planMcpConfigurationUpdate: plan
    } as unknown as SonarLintExtendedLanguageClient;
    connections = { getConnections: sinon.stub().resolves([connection]) } as unknown as AllConnectionsTreeDataProvider;
    token = sinon.stub(ConnectionSettingsService.instance, 'getTokenForConnection').resolves('secret');
    sonarQubeConnections = sinon
      .stub(ConnectionSettingsService.instance, 'getSonarQubeConnections')
      .returns([{ connectionId: 'test-connection', serverUrl: 'https://sonar.example.com' }]);
    sinon.stub(ConnectionSettingsService.instance, 'getSonarCloudConnections').returns([]);
    sinon.stub(require('node:fs'), 'existsSync').returns(false);
    write = sinon.stub(require('node:fs'), 'writeFileSync');
    sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    commands = sinon.stub(vscode.commands, 'executeCommand').resolves();
    sinon.stub(logging, 'logToSonarLintOutput');
    sinon.stub(vscode.workspace, 'onDidChangeConfiguration').callsFake(listener => {
      configurationChanged = listener;
      return new vscode.Disposable(() => {});
    });
    context = { globalState: memento(), subscriptions: [] } as unknown as vscode.ExtensionContext;
    registerCopilotMcpProvider(context, client);
  });

  teardown(() => {
    context.subscriptions.forEach(subscription => subscription.dispose());
    sinon.restore();
  });

  test('registers under the provider ID contributed in package.json', () => {
    const contributed = vscode.extensions.getExtension('SonarSource.sonarlint-vscode')?.packageJSON?.contributes
      ?.mcpServerDefinitionProviders;
    expect(register.firstCall.args[0]).to.equal(COPILOT_MCP_PROVIDER_ID);
    expect(contributed).to.deep.include({ id: COPILOT_MCP_PROVIDER_ID, label: 'SonarQube' });
    expect(isCopilotMcpProviderRegistered()).to.be.true;
  });

  test('provides no server until setup records a connection', async () => {
    expect(await registeredProvider().provideMcpServerDefinitions(undefined)).to.deep.equal([]);
    expect(isCopilotMcpProviderConfigured()).to.be.false;
    expect(generate.called).to.be.false;
  });

  test('keeps the token out of the provided definition and adds it when the server starts', async () => {
    await setCopilotMcpConnection(connection);

    const [definition] = (await registeredProvider().provideMcpServerDefinitions(undefined)) as vscode.McpStdioServerDefinition[];
    expect(definition.label).to.equal('SonarQube');
    expect(definition.command).to.equal('docker');
    expect(definition.args).to.deep.equal(LAUNCH_CONFIGURATION.args);
    expect(definition.env).to.not.have.property('SONARQUBE_TOKEN');
    expect(definition.env.SONARQUBE_IDE_PORT).to.equal('64121');

    const resolved = (await registeredProvider().resolveMcpServerDefinition(
      definition,
      undefined
    )) as vscode.McpStdioServerDefinition;
    expect(resolved.env.SONARQUBE_TOKEN).to.equal('secret');
    expect(generate.alwaysCalledWithExactly('test-connection', 'secret')).to.be.true;
  });

  test('uses the default connection ID for a connection without an ID', async () => {
    sonarQubeConnections.returns([{ serverUrl: 'https://sonar.example.com' }]);
    await setCopilotMcpConnection(new Connection(undefined, 'Default', 'sonarqubeConnection', 'ok'));

    await registeredProvider().provideMcpServerDefinitions(undefined);

    expect(generate.calledOnceWithExactly(DEFAULT_CONNECTION_ID, 'secret')).to.be.true;
    expect(token.firstCall.args[0].id).to.be.undefined;
  });

  test('stops providing the server when its connection is removed', async () => {
    await setCopilotMcpConnection(connection);
    const changed = sinon.spy();
    registeredProvider().onDidChangeMcpServerDefinitions(changed);
    sonarQubeConnections.returns([]);

    configurationChanged({ affectsConfiguration: section => section === 'sonarlint.connectedMode.connections' });

    expect(await registeredProvider().provideMcpServerDefinitions(undefined)).to.deep.equal([]);
    expect(isCopilotMcpProviderConfigured()).to.be.false;
    expect(changed.called).to.be.true;
  });

  test('provides no server when the configuration cannot be generated', async () => {
    await setCopilotMcpConnection(connection);
    generate.rejects(new Error('backend unavailable'));
    expect(await registeredProvider().provideMcpServerDefinitions(undefined)).to.deep.equal([]);
  });

  test('records the connection instead of writing mcp.json in remote windows', async () => {
    const changed = sinon.spy();
    registeredProvider().onDidChangeMcpServerDefinitions(changed);

    expect(supportsStandaloneMCP(agent)).to.be.true;
    const outcome = await configureMCPServer(client, connections, agent, connection);

    expect(outcome).to.deep.equal({ status: AiIntegration.AiIntegrationActionStatus.SUCCEEDED, agent });
    expect(isCopilotMcpProviderConfigured()).to.be.true;
    expect(changed.called).to.be.true;
    expect(write.called || plan.called).to.be.false;
    expect((await inspectMCPConfiguration(client, agent)).state).to.equal(
      AiIntegration.McpConfigurationState.STANDALONE
    );
    expect(getMCPConfigurationLocation(agent)).to.include('Provided by SonarQube for IDE');
  });

  test('uses the provider for new local setups', async () => {
    remoteName.value(undefined);
    const outcome = await configureMCPServer(client, connections, agent, connection);
    expect(outcome.status).to.equal(AiIntegration.AiIntegrationActionStatus.SUCCEEDED);
    expect(isCopilotMcpProviderConfigured()).to.be.true;
    expect(write.called || plan.called).to.be.false;
  });

  test('does not record a connection when the user cancels setup without a token', async () => {
    token.resolves(undefined);
    const outcome = await configureMCPServer(client, connections, agent, connection);
    expect(outcome.status).to.equal(AiIntegration.AiIntegrationActionStatus.CANCELLED);
    expect(isCopilotMcpProviderConfigured()).to.be.false;
  });

  test('reports an existing mcp.json entry at its file location', () => {
    remoteName.value(undefined);
    expect(getMCPConfigurationLocation(agent, AiIntegration.McpConfigurationState.STANDALONE)).to.match(
      /mcp\.json$/
    );
    expect(getMCPConfigurationLocation(agent, AiIntegration.McpConfigurationState.NOT_CONFIGURED)).to.include(
      'Provided by SonarQube for IDE'
    );
  });

  test('shows the same location in the agent picker as in the AI Integrations view', async () => {
    remoteName.value(undefined);
    (client.getAiIntegrationState as sinon.SinonStub).resolves({
      agents: [agent, AiIntegration.AiAgent.CURSOR].map(value => ({
        agent: value,
        detectionSources: [AiIntegration.AiAgentDetectionSource.IDE],
        standaloneMcpSupported: true,
        cliIntegrationSupported: false
      }))
    });
    (client.inspectMcpConfiguration as sinon.SinonStub).resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      diagnostics: []
    });
    const pick = sinon.stub(vscode.window, 'showQuickPick').resolves(undefined);

    await configureMCPServer(client, connections);

    const items = (await pick.firstCall.args[0]) as { agent: AiIntegration.AiAgent; description: string }[];
    expect(items.find(item => item.agent === agent).description).to.equal(
      getMCPConfigurationLocation(agent, AiIntegration.McpConfigurationState.STANDALONE)
    );
    expect(items.find(item => item.agent === agent).description).to.match(/mcp\.json$/);
  });

  test('signals a new IDE port to Copilot', async () => {
    const changed = sinon.spy();
    registeredProvider().onDidChangeMcpServerDefinitions(changed);
    await onEmbeddedServerStarted(client, 64122);
    expect(changed.called).to.be.true;
  });

  test('shows the MCP server list instead of a file for provider setups', async () => {
    await setCopilotMcpConnection(connection);
    const outcome = await openMCPServerConfigurationFile(client, agent);
    expect(outcome.status).to.equal(AiIntegration.AiIntegrationActionStatus.SUCCEEDED);
    expect(commands.calledWith('workbench.mcp.listServer')).to.be.true;
  });
});

suite('Copilot MCP server provider availability', () => {
  teardown(() => sinon.restore());

  test('skips registration when the host has no MCP server provider API', () => {
    sinon.stub(vscode.lm, 'registerMcpServerDefinitionProvider').value(undefined);
    const context = { globalState: memento(), subscriptions: [] } as unknown as vscode.ExtensionContext;

    registerCopilotMcpProvider(context, {} as SonarLintExtendedLanguageClient);

    expect(context.subscriptions).to.be.empty;
  });
});
