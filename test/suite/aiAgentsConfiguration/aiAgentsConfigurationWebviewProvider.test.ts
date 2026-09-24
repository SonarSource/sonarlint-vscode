/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import * as os from 'node:os';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AIAgentsConfigurationWebviewProvider } from '../../../src/aiAgentsConfiguration/aiAgentsConfigurationWebviewProvider';
import * as aiAgentHooks from '../../../src/aiAgentsConfiguration/aiAgentHooks';
import * as aiAgentRuleConfig from '../../../src/aiAgentsConfiguration/aiAgentRuleConfig';
import * as aiAgentUtils from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import { IdeHost, IntegrationTarget } from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import * as mcpServerConfig from '../../../src/aiAgentsConfiguration/mcpServerConfig';
import { AiIntegration } from '../../../src/lsp/aiIntegrationProtocol';
import { ContextManager } from '../../../src/contextManager';
import { Commands } from '../../../src/util/commands';
import * as logging from '../../../src/util/logging';
import { SETUP_TEARDOWN_HOOK_TIMEOUT } from '../commons';

suite('AIAgentsConfigurationWebviewProvider', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let provider: any;
  let getIntegrationState: sinon.SinonStub;
  let prepareInstallCliCommand: sinon.SinonStub;
  let prepareAuthenticateCliCommand: sinon.SinonStub;
  let prepareIntegrateCliCommand: sinon.SinonStub;

  setup(function () {
    this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
    provider = Object.create(AIAgentsConfigurationWebviewProvider.prototype);
    provider.extensionContext = {
      subscriptions: [],
      globalState: { get: sinon.stub(), update: sinon.stub().resolves() }
    };
    getIntegrationState = sinon.stub().resolves({
      cli: {
        installationStatus: AiIntegration.CliInstallationStatus.NOT_INSTALLED,
        authenticationStatus: AiIntegration.CliAuthenticationStatus.UNKNOWN
      },
      agents: [],
      connectionChoices: []
    });
    prepareInstallCliCommand = sinon.stub();
    prepareAuthenticateCliCommand = sinon.stub();
    prepareIntegrateCliCommand = sinon.stub();
    provider.languageClient = {
      getAiIntegrationState: getIntegrationState,
      prepareInstallCliCommand,
      prepareAuthenticateCliCommand,
      prepareIntegrateCliCommand
    };
  });

  teardown(() => sinon.restore());

  test('builds independent MCP state for detected agents', async () => {
    const detectedAgents = [
      { id: AiIntegration.AiAgent.GITHUB_COPILOT, name: 'Copilot in VS Code', source: 'extension' as const },
      { id: AiIntegration.AiAgent.CLAUDE_CODE, name: 'Claude Code', source: 'extension' as const },
      { id: AiIntegration.AiAgent.CODEX, name: 'Codex', source: 'extension' as const }
    ];
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.VSCODE, name: 'VS Code' });
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithHookSupport').returns(undefined);
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns(detectedAgents);
    sinon.stub(aiAgentUtils, 'isAgentActiveForMcp').returns(true);
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(true);
    getIntegrationState.resolves({
      cli: {
        installationStatus: 1,
        authenticationStatus: 0
      },
      agents: detectedAgents.map(agent => ({
        agent: agent.id,
        detectionSources: [AiIntegration.AiAgentDetectionSource.IDE],
        cliIntegrationSupported: agent.id === AiIntegration.AiAgent.CODEX,
        standaloneMcpSupported: agent.id !== AiIntegration.AiAgent.CODEX,
        hookSupported: false,
        skillSupported: false
      })),
      connectionChoices: []
    });
    sinon.stub(mcpServerConfig, 'inspectMCPConfiguration').callsFake(async (_client, agent) => ({
      state:
        agent === AiIntegration.AiAgent.GITHUB_COPILOT
          ? AiIntegration.McpConfigurationState.STANDALONE
          : AiIntegration.McpConfigurationState.NOT_CONFIGURED,
      diagnostics: []
    }));
    sinon.stub(mcpServerConfig, 'hasPersistedMCPConnection').returns(true);

    const state = await provider.buildState();

    expect(state.ideName).to.equal('VS Code');
    expect(getIntegrationState.calledOnce).to.be.true;
    expect(getIntegrationState.firstCall.args[0].discoverLocalAgentClis).to.be.true;
    expect(state.agents[2].supportsCliIntegration).to.be.true;
    expect(state.cli.installationStatus).to.equal('INSTALLED');
    expect(state.cli.authenticationStatus).to.equal('AUTHENTICATED');
    expect(state.mcp.configuredCount).to.equal(1);
    expect(state.mcp.configurableCount).to.equal(2);
    expect(state.mcp.integrations).to.deep.include({
      agentId: AiIntegration.AiAgent.GITHUB_COPILOT,
      agentName: 'Copilot in VS Code',
      standaloneSupported: true,
      availableThroughCli: false,
      configurationPath: mcpServerConfig.getMCPConfigPath(AiIntegration.AiAgent.GITHUB_COPILOT),
      configurationStatus: 'STANDALONE',
      diagnostic: undefined,
      requiresSetup: false,
      operationInProgress: false
    });
    expect(state.mcp.integrations).to.deep.include({
      agentId: AiIntegration.AiAgent.CODEX,
      agentName: 'Codex',
      standaloneSupported: false,
      availableThroughCli: true,
      configurationPath: undefined,
      configurationStatus: undefined,
      diagnostic: undefined,
      requiresSetup: false,
      operationInProgress: false
    });
  });

  test('omits inactive Copilot from standalone MCP rows', async () => {
    const detectedAgents = [
      { id: AiIntegration.AiAgent.GITHUB_COPILOT, name: 'Copilot in VS Code', source: 'extension' as const },
      { id: AiIntegration.AiAgent.CLAUDE_CODE, name: 'Claude Code', source: 'extension' as const }
    ];
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.VSCODE, name: 'VS Code' });
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithHookSupport').returns(undefined);
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns(detectedAgents);
    sinon
      .stub(aiAgentUtils, 'isAgentActiveForMcp')
      .callsFake(agent => agent !== AiIntegration.AiAgent.GITHUB_COPILOT);
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);
    getIntegrationState.resolves({
      cli: {
        installationStatus: AiIntegration.CliInstallationStatus.NOT_INSTALLED,
        authenticationStatus: AiIntegration.CliAuthenticationStatus.UNKNOWN
      },
      agents: detectedAgents.map(agent => ({
        agent: agent.id,
        detectionSources: [AiIntegration.AiAgentDetectionSource.IDE],
        cliIntegrationSupported: false,
        standaloneMcpSupported: true,
        hookSupported: false,
        skillSupported: false
      })),
      connectionChoices: []
    });
    const inspect = sinon.stub(mcpServerConfig, 'inspectMCPConfiguration').resolves({
      state: AiIntegration.McpConfigurationState.NOT_CONFIGURED,
      diagnostics: []
    });

    const state = await provider.buildState();

    expect(state.agents.map(agent => agent.id)).to.deep.equal(detectedAgents.map(agent => agent.id));
    expect(state.mcp.integrations.map(integration => integration.agentId)).to.deep.equal([
      AiIntegration.AiAgent.CLAUDE_CODE
    ]);
    expect(inspect.calledOnce).to.be.true;
    expect(inspect.firstCall.args[1]).to.equal(AiIntegration.AiAgent.CLAUDE_CODE);
  });

  test('includes CLI-only agents and inspects their supported standalone configurations', async () => {
    const setMcpContext = sinon.stub(ContextManager.instance, 'setMCPServerSupportedAgentContext');
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.VSCODE, name: 'VS Code' });
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithHookSupport').returns(undefined);
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([
      { id: AiIntegration.AiAgent.GITHUB_COPILOT, name: 'Copilot in VS Code', source: 'extension' }
    ]);
    sinon.stub(aiAgentUtils, 'isAgentActiveForMcp').returns(true);
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);
    const capability = (
      agent: AiIntegration.AiAgent,
      detectionSources: AiIntegration.AiAgentDetectionSource[],
      standaloneMcpSupported: boolean
    ) => ({
      agent,
      detectionSources,
      cliIntegrationSupported: true,
      standaloneMcpSupported,
      hookSupported: false,
      skillSupported: false
    });
    getIntegrationState.resolves({
      cli: {
        installationStatus: AiIntegration.CliInstallationStatus.INSTALLED,
        authenticationStatus: AiIntegration.CliAuthenticationStatus.AUTHENTICATED
      },
      agents: [
        capability(AiIntegration.AiAgent.CURSOR, [AiIntegration.AiAgentDetectionSource.CLI], true),
        capability(AiIntegration.AiAgent.CODEX, [AiIntegration.AiAgentDetectionSource.CLI], false),
        capability(AiIntegration.AiAgent.GITHUB_COPILOT_CLI, [AiIntegration.AiAgentDetectionSource.CLI], false),
        capability(AiIntegration.AiAgent.CLAUDE_CODE, [
          AiIntegration.AiAgentDetectionSource.IDE,
          AiIntegration.AiAgentDetectionSource.CLI
        ], true),
        capability(AiIntegration.AiAgent.GITHUB_COPILOT, [AiIntegration.AiAgentDetectionSource.IDE], true)
      ],
      connectionChoices: []
    });
    const inspect = sinon.stub(mcpServerConfig, 'inspectMCPConfiguration').resolves({
      state: AiIntegration.McpConfigurationState.NOT_CONFIGURED,
      diagnostics: []
    });

    const state = await provider.buildState();

    expect(state.agents.map(agent => agent.id)).to.have.members([
      AiIntegration.AiAgent.GITHUB_COPILOT,
      AiIntegration.AiAgent.CURSOR,
      AiIntegration.AiAgent.CODEX,
      AiIntegration.AiAgent.GITHUB_COPILOT_CLI,
      AiIntegration.AiAgent.CLAUDE_CODE
    ]);
    expect(state.agents).to.have.length(5);
    expect(setMcpContext.calledOnceWithExactly(true)).to.be.true;
    expect(inspect.getCalls().map(call => call.args[1])).to.have.members([
      AiIntegration.AiAgent.GITHUB_COPILOT,
      AiIntegration.AiAgent.CURSOR,
      AiIntegration.AiAgent.CLAUDE_CODE
    ]);
    expect(state.mcp.integrations.find(row => row.agentId === AiIntegration.AiAgent.CURSOR)).to.include({
      standaloneSupported: true,
      configurationStatus: 'NOT_CONFIGURED'
    });
    expect(state.mcp.integrations.find(row => row.agentId === AiIntegration.AiAgent.CODEX)).to.include({
      availableThroughCli: true,
      standaloneSupported: false
    });
    expect(state.mcp.integrations.find(row => row.agentId === AiIntegration.AiAgent.GITHUB_COPILOT_CLI)).to.include({
      availableThroughCli: true,
      standaloneSupported: false
    });
  });

  test('keeps other MCP integrations available when one inspection fails', async () => {
    const detectedAgents = [
      { id: AiIntegration.AiAgent.CURSOR, name: 'Cursor', source: 'ide' as const },
      { id: AiIntegration.AiAgent.CLAUDE_CODE, name: 'Claude Code', source: 'extension' as const }
    ];
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.CURSOR, name: 'Cursor' });
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithHookSupport').returns(undefined);
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns(detectedAgents);
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);
    getIntegrationState.resolves({
      cli: {
        installationStatus: AiIntegration.CliInstallationStatus.NOT_INSTALLED,
        authenticationStatus: AiIntegration.CliAuthenticationStatus.UNKNOWN
      },
      agents: detectedAgents.map(agent => ({
        agent: agent.id,
        detectionSources: [AiIntegration.AiAgentDetectionSource.IDE],
        cliIntegrationSupported: false,
        standaloneMcpSupported: true,
        hookSupported: false,
        skillSupported: false
      })),
      connectionChoices: []
    });
    sinon.stub(mcpServerConfig, 'inspectMCPConfiguration').callsFake(async (_client, agent) => {
      if (agent === AiIntegration.AiAgent.CURSOR) {
        throw new Error('read failed');
      }
      return { state: AiIntegration.McpConfigurationState.NOT_CONFIGURED, diagnostics: [] };
    });
    const log = sinon.stub(logging, 'logToSonarLintOutput');

    const state = await provider.buildState();

    expect(state.mcp.integrations[0].configurationStatus).to.equal('UNKNOWN');
    expect(state.mcp.integrations[1].configurationStatus).to.equal('NOT_CONFIGURED');
    expect(log.calledOnceWith('Could not inspect Cursor MCP configuration: Error: read failed')).to.be.true;
  });

  test('requires setup again for a standalone config with no persisted connection', async () => {
    const cursor = { id: AiIntegration.AiAgent.CURSOR, name: 'Cursor', source: 'ide' as const };
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.CURSOR, name: 'Cursor' });
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithHookSupport').returns(undefined);
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([cursor]);
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);
    getIntegrationState.resolves({
      cli: {
        installationStatus: AiIntegration.CliInstallationStatus.NOT_INSTALLED,
        authenticationStatus: AiIntegration.CliAuthenticationStatus.UNKNOWN
      },
      agents: [
        {
          agent: cursor.id,
          detectionSources: [AiIntegration.AiAgentDetectionSource.IDE],
          cliIntegrationSupported: false,
          standaloneMcpSupported: true,
          hookSupported: false,
          skillSupported: false
        }
      ],
      connectionChoices: []
    });
    sinon.stub(mcpServerConfig, 'inspectMCPConfiguration').resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      diagnostics: []
    });
    sinon.stub(mcpServerConfig, 'hasPersistedMCPConnection').returns(false);

    const state = await provider.buildState();

    expect(state.mcp.integrations[0].configurationStatus).to.equal('STANDALONE');
    expect(state.mcp.integrations[0].requiresSetup).to.be.true;
  });

  test('exposes malformed and CLI-managed states independently', async () => {
    const detectedAgents = [
      { id: AiIntegration.AiAgent.CURSOR, name: 'Cursor', source: 'ide' as const },
      { id: AiIntegration.AiAgent.CLAUDE_CODE, name: 'Claude Code', source: 'extension' as const }
    ];
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.CURSOR, name: 'Cursor' });
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithHookSupport').returns(undefined);
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns(detectedAgents);
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);
    getIntegrationState.resolves({
      cli: {
        installationStatus: AiIntegration.CliInstallationStatus.NOT_INSTALLED,
        authenticationStatus: AiIntegration.CliAuthenticationStatus.UNKNOWN
      },
      agents: detectedAgents.map(agent => ({
        agent: agent.id,
        detectionSources: [AiIntegration.AiAgentDetectionSource.IDE],
        cliIntegrationSupported: false,
        standaloneMcpSupported: true,
        hookSupported: false,
        skillSupported: false
      })),
      connectionChoices: []
    });
    sinon.stub(mcpServerConfig, 'inspectMCPConfiguration').callsFake(async (_client, agent) =>
      agent === AiIntegration.AiAgent.CURSOR
        ? {
            state: AiIntegration.McpConfigurationState.MALFORMED,
            diagnostics: ['Fix the malformed MCP configuration.']
          }
        : {
            state: AiIntegration.McpConfigurationState.CLI_MANAGED,
            diagnostics: ['Managed by the CLI.']
          }
    );

    const state = await provider.buildState();

    expect(state.mcp.integrations[0]).to.include({
      configurationStatus: 'MALFORMED',
      diagnostic: 'Fix the malformed MCP configuration.'
    });
    expect(state.mcp.integrations[1]).to.include({
      configurationStatus: 'CLI_MANAGED',
      diagnostic: 'Managed by the CLI.'
    });
  });

  test('includes the current IDE hook state', async () => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.WINDSURF, name: 'Windsurf' });
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithHookSupport').returns(IntegrationTarget.WINDSURF);
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([]);
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);
    sinon.stub(aiAgentHooks, 'isHookInstalled').resolves(true);

    const state = await provider.buildState();

    expect(state.cli.hook).to.deep.equal({ supported: true, configured: true });
    expect(state.mcp.legacyInstructionsConfigured).to.be.false;
  });

  test('preserves an unusable CLI status', async () => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.VSCODE, name: 'VS Code' });
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithHookSupport').returns(undefined);
    sinon
      .stub(aiAgentUtils, 'getDetectedIdeAgents')
      .returns([{ id: AiIntegration.AiAgent.CODEX, name: 'Codex', source: 'extension' }]);
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);
    getIntegrationState.resolves({
      cli: {
        installationStatus: AiIntegration.CliInstallationStatus.UNUSABLE,
        authenticationStatus: AiIntegration.CliAuthenticationStatus.UNKNOWN
      },
      agents: [
        {
          agent: AiIntegration.AiAgent.CODEX,
          detectionSources: [AiIntegration.AiAgentDetectionSource.IDE],
          cliIntegrationSupported: true,
          standaloneMcpSupported: false,
          hookSupported: false,
          skillSupported: false
        }
      ],
      connectionChoices: []
    });

    const state = await provider.buildState();

    expect(state.cli.installationStatus).to.equal('UNUSABLE');
    expect(state.agents[0].supportsCliIntegration).to.be.true;
  });

  test('keeps CLI setup feedback on webview load and clears it on explicit refresh', async () => {
    const notice = { outcome: 'completed', message: 'Setup finished.' };
    const postMessage = sinon.stub().resolves();
    provider.cliSetupSession = { notice };
    provider.view = { webview: { postMessage } };
    provider.buildState = sinon.stub().callsFake(async () => ({ cli: { notice: provider.cliSetupSession.notice } }));

    await provider.handleMessage({ command: 'ready' });
    expect(postMessage.firstCall.args[0].state.cli.notice).to.equal(notice);

    await provider.handleMessage({ command: 'refresh' });
    expect(provider.cliSetupSession.notice).to.be.undefined;
    expect(postMessage.secondCall.args[0].state.cli.notice).to.be.undefined;
  });

  test('shows a generic error state and recovers on a later refresh', async () => {
    const postMessage = sinon.stub().resolves();
    const log = sinon.stub(logging, 'logToSonarLintOutput');
    const state = { cli: { installationStatus: 'INSTALLED' } };
    provider.view = { webview: { postMessage } };
    provider.buildState = sinon
      .stub()
      .onFirstCall()
      .rejects(new Error('backend details'))
      .onSecondCall()
      .resolves(state);

    await provider.refresh();
    await provider.refresh();

    expect(postMessage.firstCall.args).to.deep.equal([{ command: 'error' }]);
    expect(postMessage.secondCall.args).to.deep.equal([{ command: 'state', state }]);
    expect(log.calledOnceWith('Could not refresh AI integrations state: Error: backend details')).to.be.true;
  });

  test('does not reject when the view is disposed during refresh', async () => {
    const postMessage = sinon.stub().rejects(new Error('Webview is disposed'));
    provider.view = { webview: { postMessage } };
    provider.buildState = sinon.stub().resolves({});

    await provider.refresh();

    expect(postMessage.callCount).to.equal(2);
  });

  test('routes MCP setup through the existing command', async () => {
    const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();

    await provider.handleMessage({ command: 'configureMcp', agent: AiIntegration.AiAgent.CURSOR });

    expect(executeCommand.calledOnceWithExactly(
      Commands.CONFIGURE_MCP_SERVER,
      AiIntegration.AiAgent.CURSOR
    )).to.be.true;
  });

  test('opens hook configuration from the CLI card', async () => {
    const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();

    await provider.handleMessage({ command: 'openHook' });

    expect(executeCommand.calledOnceWith(Commands.OPEN_AI_AGENT_HOOK_CONFIGURATION)).to.be.true;
  });

  test('opens the SonarQube CLI guide from the CLI card', async () => {
    const openExternal = sinon.stub(vscode.env, 'openExternal').resolves(true);

    await provider.handleMessage({ command: 'openCliDocumentation' });

    expect(openExternal.calledOnceWith(vscode.Uri.parse('https://docs.sonarsource.com/sonarqube-cli'))).to.be.true;
  });

  test('opens the Vortex documentation from the CLI card', async () => {
    const openExternal = sinon.stub(vscode.env, 'openExternal').resolves(true);

    await provider.handleMessage({ command: 'openVortexDocumentation' });

    expect(openExternal.calledOnceWith(vscode.Uri.parse('https://docs.sonarsource.com/agent-centric-development-cycle/inside-your-agent-the-agentic-loop/sonar-vortex')))
      .to.be.true;
  });

  test('runs the prepared installation command in one visible terminal', async () => {
    const terminal = { show: sinon.stub() };
    const createTerminal = sinon.stub(vscode.window, 'createTerminal').returns(terminal as unknown as vscode.Terminal);
    const closeListener = { dispose: sinon.stub() };
    const onDidCloseTerminal = sinon.stub(vscode.window, 'onDidCloseTerminal').returns(closeListener);
    prepareInstallCliCommand.resolves({
      executable: '/bin/sh',
      arguments: ['-c', 'install-sonar'],
      interactive: false
    });
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'installCli' });
    await provider.handleMessage({ command: 'installCli' });

    expect(prepareInstallCliCommand.calledOnceWithExactly()).to.be.true;
    expect(
      createTerminal.calledOnceWithExactly({
        name: 'SonarQube CLI installation',
        shellPath: '/bin/sh',
        shellArgs: ['-c', 'install-sonar'],
        cwd: os.homedir()
      })
    ).to.be.true;
    expect(terminal.show.calledOnce).to.be.true;
    expect(provider.extensionContext.subscriptions).to.deep.equal([closeListener]);

    const exitStatus = { code: undefined, reason: vscode.TerminalExitReason.User };
    Object.assign(terminal, { exitStatus });
    onDidCloseTerminal.firstCall.args[0](terminal as unknown as vscode.Terminal);
    expect(closeListener.dispose.called).to.be.false;
    expect(provider.cliSetupSession.operationInProgress).to.be.false;
    expect(provider.cliSetupSession.notice).to.deep.include({ outcome: 'cancelled' });
  });

  test('prepares login without a connection when the IDE has none', async () => {
    const terminal = { show: sinon.stub() };
    sinon.stub(vscode.window, 'createTerminal').returns(terminal as unknown as vscode.Terminal);
    sinon.stub(vscode.window, 'onDidCloseTerminal').returns({ dispose: sinon.stub() });
    getIntegrationState.resolves({
      cli: {
        installationStatus: AiIntegration.CliInstallationStatus.INSTALLED,
        authenticationStatus: AiIntegration.CliAuthenticationStatus.UNAUTHENTICATED
      },
      agents: [],
      connectionChoices: []
    });
    prepareAuthenticateCliCommand.resolves({
      executable: '/usr/local/bin/sonar',
      arguments: ['auth', 'login'],
      interactive: true
    });
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'authenticateCli' });

    expect(prepareAuthenticateCliCommand.calledOnceWithExactly({})).to.be.true;
    expect(terminal.show.calledOnce).to.be.true;
  });

  test('prepares login with the recommended IDE connection', async () => {
    const terminal = { show: sinon.stub() };
    sinon.stub(vscode.window, 'createTerminal').returns(terminal as unknown as vscode.Terminal);
    sinon.stub(vscode.window, 'onDidCloseTerminal').returns({ dispose: sinon.stub() });
    getIntegrationState.resolves({
      cli: {
        installationStatus: AiIntegration.CliInstallationStatus.INSTALLED,
        authenticationStatus: AiIntegration.CliAuthenticationStatus.UNAUTHENTICATED
      },
      agents: [],
      connectionChoices: [{ connectionId: 'cloud', serverUrl: 'https://sonarcloud.io', organization: 'example' }],
      recommendedConnectionId: 'cloud'
    });
    prepareAuthenticateCliCommand.resolves({
      executable: '/usr/local/bin/sonar',
      arguments: ['auth', 'login', '--server', 'https://sonarcloud.io', '--org', 'example'],
      interactive: true
    });
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'authenticateCli' });

    expect(
      prepareAuthenticateCliCommand.calledOnceWithExactly({
        serverUrl: 'https://sonarcloud.io',
        organization: 'example'
      })
    ).to.be.true;
    expect(terminal.show.calledOnce).to.be.true;
  });

  test('allows login when existing CLI authentication could not be verified', async () => {
    const terminal = { show: sinon.stub() };
    sinon.stub(vscode.window, 'createTerminal').returns(terminal as unknown as vscode.Terminal);
    sinon.stub(vscode.window, 'onDidCloseTerminal').returns({ dispose: sinon.stub() });
    getIntegrationState.resolves({
      cli: {
        installationStatus: AiIntegration.CliInstallationStatus.INSTALLED,
        authenticationStatus: AiIntegration.CliAuthenticationStatus.UNVERIFIED
      },
      agents: [],
      connectionChoices: [{ connectionId: 'server', serverUrl: 'https://server.example' }]
    });
    prepareAuthenticateCliCommand.resolves({
      executable: '/usr/local/bin/sonar',
      arguments: ['auth', 'login', '--server', 'https://server.example'],
      interactive: true
    });
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'authenticateCli' });

    expect(
      prepareAuthenticateCliCommand.calledOnceWithExactly({
        serverUrl: 'https://server.example'
      })
    ).to.be.true;
  });

  test('reports a cancelled login connection selection without starting a command', async () => {
    sinon.stub(vscode.window, 'showQuickPick').resolves(undefined);
    getIntegrationState.resolves({
      cli: {
        installationStatus: AiIntegration.CliInstallationStatus.INSTALLED,
        authenticationStatus: AiIntegration.CliAuthenticationStatus.UNAUTHENTICATED
      },
      agents: [],
      connectionChoices: [
        { connectionId: 'server', serverUrl: 'https://server.example' },
        { connectionId: 'cloud', serverUrl: 'https://sonarcloud.io', organization: 'example' }
      ]
    });
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'authenticateCli' });

    expect(prepareAuthenticateCliCommand.notCalled).to.be.true;
    expect(provider.cliSetupSession.notice).to.deep.equal({
      outcome: 'cancelled',
      message: 'SonarQube CLI login was cancelled.'
    });
    expect(provider.cliSetupSession.operationInProgress).to.be.false;
  });

  test('runs supported agent integration interactively', async () => {
    sinon
      .stub(aiAgentUtils, 'getDetectedIdeAgents')
      .returns([{ id: AiIntegration.AiAgent.CLAUDE_CODE, name: 'Claude Code', source: 'extension' }]);
    const terminal = { show: sinon.stub() };
    sinon.stub(vscode.window, 'createTerminal').returns(terminal as unknown as vscode.Terminal);
    sinon.stub(vscode.window, 'onDidCloseTerminal').returns({ dispose: sinon.stub() });
    getIntegrationState.resolves({
      cli: {
        installationStatus: AiIntegration.CliInstallationStatus.INSTALLED,
        authenticationStatus: AiIntegration.CliAuthenticationStatus.AUTHENTICATED
      },
      agents: [
        {
          agent: AiIntegration.AiAgent.CLAUDE_CODE,
          detectionSources: [AiIntegration.AiAgentDetectionSource.IDE],
          cliIntegrationSupported: true,
          standaloneMcpSupported: true,
          hookSupported: true,
          skillSupported: true
        }
      ],
      connectionChoices: []
    });
    prepareIntegrateCliCommand.resolves({
      executable: '/usr/local/bin/sonar',
      arguments: ['integrate', 'claude', '--global'],
      interactive: true
    });
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'integrateAgent', agent: AiIntegration.AiAgent.CLAUDE_CODE });

    expect(
      prepareIntegrateCliCommand.calledOnceWithExactly({
        agent: AiIntegration.AiAgent.CLAUDE_CODE
      })
    ).to.be.true;
    expect(terminal.show.calledOnce).to.be.true;
  });

  test('integrates a CLI-only agent after fresh backend validation', async () => {
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([]);
    const terminal = { show: sinon.stub() };
    sinon.stub(vscode.window, 'createTerminal').returns(terminal as unknown as vscode.Terminal);
    sinon.stub(vscode.window, 'onDidCloseTerminal').returns({ dispose: sinon.stub() });
    getIntegrationState.resolves({
      cli: {
        installationStatus: AiIntegration.CliInstallationStatus.INSTALLED,
        authenticationStatus: AiIntegration.CliAuthenticationStatus.AUTHENTICATED
      },
      agents: [{
        agent: AiIntegration.AiAgent.CODEX,
        detectionSources: [AiIntegration.AiAgentDetectionSource.CLI],
        cliIntegrationSupported: true,
        standaloneMcpSupported: false,
        hookSupported: false,
        skillSupported: false
      }],
      connectionChoices: []
    });
    prepareIntegrateCliCommand.resolves({
      executable: '/usr/local/bin/sonar',
      arguments: ['integrate', 'codex', '--global'],
      interactive: true
    });
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'integrateAgent', agent: AiIntegration.AiAgent.CODEX });

    expect(prepareIntegrateCliCommand.calledOnceWithExactly({ agent: AiIntegration.AiAgent.CODEX })).to.be.true;
    expect(terminal.show.calledOnce).to.be.true;
  });

  test('rejects a stale CLI integration target before command preparation', async () => {
    getIntegrationState.resolves({
      cli: {
        installationStatus: AiIntegration.CliInstallationStatus.INSTALLED,
        authenticationStatus: AiIntegration.CliAuthenticationStatus.AUTHENTICATED
      },
      agents: [],
      connectionChoices: []
    });
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'integrateAgent', agent: AiIntegration.AiAgent.CODEX });

    expect(prepareIntegrateCliCommand.notCalled).to.be.true;
  });

  test('allows CLI setup while background MCP work is running', async () => {
    sinon.stub(mcpServerConfig, 'isMCPSetupInProgress').returns(true);
    const terminal = { show: sinon.stub() };
    sinon.stub(vscode.window, 'createTerminal').returns(terminal as unknown as vscode.Terminal);
    sinon.stub(vscode.window, 'onDidCloseTerminal').returns({ dispose: sinon.stub() });
    prepareInstallCliCommand.resolves({
      executable: '/usr/local/bin/sonar',
      arguments: ['install'],
      interactive: true
    });
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'installCli' });

    expect(prepareInstallCliCommand.calledOnce).to.be.true;
    expect(terminal.show.calledOnce).to.be.true;
  });

  test('allows MCP setup while a CLI terminal remains open', async () => {
    const terminal = { show: sinon.stub() };
    sinon.stub(vscode.window, 'createTerminal').returns(terminal as unknown as vscode.Terminal);
    sinon.stub(vscode.window, 'onDidCloseTerminal').returns({ dispose: sinon.stub() });
    prepareInstallCliCommand.resolves({
      executable: '/usr/local/bin/sonar',
      arguments: ['install'],
      interactive: true
    });
    const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'installCli' });
    await provider.handleMessage({ command: 'configureMcp', agent: AiIntegration.AiAgent.CURSOR });

    expect(executeCommand.calledOnceWithExactly(Commands.CONFIGURE_MCP_SERVER, AiIntegration.AiAgent.CURSOR)).to.be.true;
  });

  test('opens only existing legacy instructions', async () => {
    const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'openLegacyInstructions' });

    expect(executeCommand.calledOnceWith(Commands.OPEN_SONARQUBE_RULES_FILE, false)).to.be.true;
    expect(provider.refresh.called).to.be.false;
  });
});
