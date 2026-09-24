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
import {
  AIAgentsConfigurationWebviewProvider,
  resolveMcpCard
} from '../../../src/aiAgentsConfiguration/aiAgentsConfigurationWebviewProvider';
import * as aiAgentHooks from '../../../src/aiAgentsConfiguration/aiAgentHooks';
import * as aiAgentRuleConfig from '../../../src/aiAgentsConfiguration/aiAgentRuleConfig';
import * as aiAgentUtils from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import { IdeHost, IntegrationTarget } from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import * as mcpServerConfig from '../../../src/aiAgentsConfiguration/mcpServerConfig';
import { AiIntegration } from '../../../src/lsp/aiIntegrationProtocol';
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
    provider.extensionContext = { subscriptions: [] };
    provider.mcpSetupInProgress = false;
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

  test('builds the CLI and MCP card state', async () => {
    const integrationStateParams = {
      ideHost: IdeHost.VSCODE,
      detectedAgents: [AiIntegration.AiAgent.CODEX],
      scope: AiIntegration.AiIntegrationScope.GLOBAL,
      configurationScopeId: undefined
    };
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.VSCODE, name: 'VS Code' });
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithMCPSupport').returns(IntegrationTarget.GITHUB_COPILOT);
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithHookSupport').returns(undefined);
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([
      {
        id: AiIntegration.AiAgent.CODEX,
        name: 'Codex',
        source: 'extension'
      }
    ]);
    getIntegrationState.resolves({
      cli: {
        installationStatus: 1,
        authenticationStatus: 0
      },
      agents: [
        {
          agent: 5,
          detectionSources: [0],
          cliIntegrationSupported: true,
          standaloneMcpSupported: false,
          hookSupported: false,
          skillSupported: true
        }
      ],
      connectionChoices: []
    });
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(true);
    sinon.stub(mcpServerConfig, 'inspectCurrentMCPConfiguration').resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      diagnostics: []
    });
    sinon.stub(aiAgentUtils, 'getAiIntegrationStateParams').returns(integrationStateParams);
    sinon.stub(mcpServerConfig, 'hasPersistedMCPConnection').returns(true);

    const state = await provider.buildState();

    expect(state.ideName).to.equal('VS Code');
    expect(getIntegrationState.calledOnceWithExactly(integrationStateParams)).to.be.true;
    expect(state.agents[0].supportsCliIntegration).to.be.true;
    expect(state.cli).to.deep.equal({
      installationStatus: 'INSTALLED',
      authenticationStatus: 'AUTHENTICATED',
      serverUrl: undefined,
      organization: undefined,
      operationInProgress: false,
      notice: undefined,
      primaryAction: undefined,
      canIntegrate: true,
      hook: { supported: false, configured: false }
    });
    expect(state.mcp).to.deep.equal({
      supported: true,
      configurationStatus: 'STANDALONE',
      diagnostic: undefined,
      operationInProgress: false,
      requiresSetup: false,
      agentName: undefined,
      legacyInstructionsConfigured: true,
      statusLabel: 'Configured',
      statusKind: 'configured',
      readiness: 'Connection not verified',
      primaryAction: { command: 'openMcpConfiguration', label: 'Open configuration', disabled: false }
    });
  });

  test('requires setup again for a standalone config with no persisted connection', async () => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.CURSOR, name: 'Cursor' });
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithMCPSupport').returns(IntegrationTarget.CURSOR);
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithHookSupport').returns(undefined);
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([]);
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);
    sinon.stub(mcpServerConfig, 'inspectCurrentMCPConfiguration').resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      diagnostics: []
    });
    sinon.stub(mcpServerConfig, 'hasPersistedMCPConnection').returns(false);

    const state = await provider.buildState();

    expect(state.mcp.configurationStatus).to.equal('STANDALONE');
    expect(state.mcp.requiresSetup).to.be.true;
    expect(state.mcp.readiness).to.equal('Set up MCP again to update the IDE connection.');
    expect(state.mcp.primaryAction).to.deep.equal({
      command: 'configureMcp',
      label: 'Set up MCP again',
      disabled: false
    });
  });

  test('exposes shared MCP states and their first diagnostic', async () => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.CURSOR, name: 'Cursor' });
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithMCPSupport').returns(IntegrationTarget.CURSOR);
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithHookSupport').returns(undefined);
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([]);
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);
    const inspect = sinon.stub(mcpServerConfig, 'inspectCurrentMCPConfiguration').resolves({
      state: AiIntegration.McpConfigurationState.MALFORMED,
      diagnostics: ['Fix the malformed MCP configuration.']
    });

    const malformedState = await provider.buildState();
    expect(malformedState.mcp.configurationStatus).to.equal('MALFORMED');
    expect(malformedState.mcp.diagnostic).to.equal('Fix the malformed MCP configuration.');
    expect(malformedState.mcp.readiness).to.equal('Fix the malformed MCP configuration.');
    expect(malformedState.mcp.primaryAction).to.deep.equal({
      command: 'openMcpConfiguration',
      label: 'Open configuration',
      disabled: false
    });

    inspect.resolves({
      state: AiIntegration.McpConfigurationState.CLI_MANAGED,
      diagnostics: ['Managed by the CLI.']
    });
    const cliManagedState = await provider.buildState();
    expect(cliManagedState.mcp.configurationStatus).to.equal('CLI_MANAGED');
    expect(cliManagedState.mcp.diagnostic).to.equal('Managed by the CLI.');
  });

  test('keeps the other integration state available when MCP inspection fails', async () => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.CURSOR, name: 'Cursor' });
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithMCPSupport').returns(IntegrationTarget.CURSOR);
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithHookSupport').returns(undefined);
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([]);
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);
    sinon.stub(mcpServerConfig, 'inspectCurrentMCPConfiguration').rejects(new Error('read failed'));
    const log = sinon.stub(logging, 'logToSonarLintOutput');

    const state = await provider.buildState();

    expect(state.cli.installationStatus).to.equal('NOT_INSTALLED');
    expect(state.mcp.configurationStatus).to.equal('UNKNOWN');
    expect(state.mcp.diagnostic).to.equal('Could not inspect the MCP configuration.');
    expect(log.calledOnceWith('Could not inspect MCP configuration: Error: read failed')).to.be.true;
  });

  test('includes the current IDE hook state and hides absent legacy instructions', async () => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.WINDSURF, name: 'Windsurf' });
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithMCPSupport').returns(IntegrationTarget.WINDSURF);
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithHookSupport').returns(IntegrationTarget.WINDSURF);
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([]);
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);
    sinon.stub(aiAgentHooks, 'isHookInstalled').resolves(true);
    sinon.stub(mcpServerConfig, 'inspectCurrentMCPConfiguration').resolves(undefined);

    const state = await provider.buildState();

    expect(state.cli).to.deep.equal({
      installationStatus: 'NOT_INSTALLED',
      authenticationStatus: 'UNKNOWN',
      serverUrl: undefined,
      organization: undefined,
      operationInProgress: false,
      notice: undefined,
      primaryAction: { command: 'installCli', label: 'Install SonarQube CLI' },
      canIntegrate: false,
      hook: { supported: true, configured: true }
    });
    expect(state.mcp.legacyInstructionsConfigured).to.be.false;
  });

  test('preserves an unusable CLI status without enabling unsupported local integrations', async () => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.VSCODE, name: 'VS Code' });
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithMCPSupport').returns(undefined);
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithHookSupport').returns(undefined);
    sinon
      .stub(aiAgentUtils, 'getDetectedIdeAgents')
      .returns([{ id: AiIntegration.AiAgent.CODEX, name: 'Codex', source: 'extension' }]);
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);
    sinon.stub(mcpServerConfig, 'inspectCurrentMCPConfiguration').resolves(undefined);
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
          standaloneMcpSupported: true,
          hookSupported: true,
          skillSupported: true
        }
      ],
      connectionChoices: []
    });

    const state = await provider.buildState();

    expect(state.cli).to.deep.equal({
      installationStatus: 'UNUSABLE',
      authenticationStatus: 'UNKNOWN',
      serverUrl: undefined,
      organization: undefined,
      operationInProgress: false,
      notice: undefined,
      primaryAction: { command: 'openCliDocumentation', label: 'Open troubleshooting guide' },
      canIntegrate: false,
      hook: { supported: false, configured: false }
    });
    expect(state.agents[0].supportsCliIntegration).to.be.true;
    expect(state.mcp.supported).to.be.false;
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
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'configureMcp' });

    expect(executeCommand.calledOnceWith(Commands.CONFIGURE_MCP_SERVER)).to.be.true;
    expect(provider.refresh.calledTwice).to.be.true;
    expect(provider.mcpSetupInProgress).to.be.false;
  });

  test('ignores repeated MCP setup requests while one is running', async () => {
    let finishSetup: () => void;
    const setupFinished = new Promise<void>(resolve => (finishSetup = resolve));
    const executeCommand = sinon.stub(vscode.commands, 'executeCommand').returns(setupFinished);
    provider.refresh = sinon.stub().resolves();

    const firstSetup = provider.handleMessage({ command: 'configureMcp' });
    await Promise.resolve();
    await provider.handleMessage({ command: 'configureMcp' });

    expect(executeCommand.calledOnceWith(Commands.CONFIGURE_MCP_SERVER)).to.be.true;
    expect(provider.mcpSetupInProgress).to.be.true;
    finishSetup();
    await firstSetup;
    expect(provider.mcpSetupInProgress).to.be.false;
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
    expect(terminal.show.calledTwice).to.be.true;
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

  test('opens only existing legacy instructions', async () => {
    const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'openLegacyInstructions' });

    expect(executeCommand.calledOnceWith(Commands.OPEN_SONARQUBE_RULES_FILE, false)).to.be.true;
    expect(provider.refresh.called).to.be.false;
  });

  test('resolves MCP card actions for local and remote states', () => {
    const cases: Array<{
      name: string;
      params: Parameters<typeof resolveMcpCard>[0];
      expected: ReturnType<typeof resolveMcpCard>;
    }> = [
      {
        name: 'remote + requiresSetup enables re-setup',
        params: {
          supported: true,
          configurationStatus: 'STANDALONE',
          requiresSetup: true,
          isRemote: true,
          operationInProgress: false
        },
        expected: {
          statusLabel: 'Configured',
          statusKind: 'configured',
          readiness: 'Set up MCP again to update the IDE connection.',
          primaryAction: { command: 'configureMcp', label: 'Set up MCP again', disabled: false }
        }
      },
      {
        name: 'remote + NOT_CONFIGURED stays disabled',
        params: {
          supported: true,
          configurationStatus: 'NOT_CONFIGURED',
          requiresSetup: false,
          isRemote: true,
          operationInProgress: false
        },
        expected: {
          statusLabel: 'Not configured',
          statusKind: 'notConfigured',
          readiness: '',
          primaryAction: { command: 'configureMcp', label: 'Set up MCP', disabled: true }
        }
      },
      {
        name: 'local + NOT_CONFIGURED enables setup',
        params: {
          supported: true,
          configurationStatus: 'NOT_CONFIGURED',
          requiresSetup: false,
          isRemote: false,
          operationInProgress: false
        },
        expected: {
          statusLabel: 'Not configured',
          statusKind: 'notConfigured',
          readiness: '',
          primaryAction: { command: 'configureMcp', label: 'Set up MCP', disabled: false }
        }
      },
      {
        name: 'STANDALONE persisted opens configuration',
        params: {
          supported: true,
          configurationStatus: 'STANDALONE',
          requiresSetup: false,
          isRemote: true,
          operationInProgress: false
        },
        expected: {
          statusLabel: 'Configured',
          statusKind: 'configured',
          readiness: 'Connection not verified',
          primaryAction: { command: 'openMcpConfiguration', label: 'Open configuration', disabled: false }
        }
      },
      {
        name: 'CLI_MANAGED opens configuration',
        params: {
          supported: true,
          configurationStatus: 'CLI_MANAGED',
          diagnostic: 'Managed by the CLI.',
          requiresSetup: false,
          isRemote: false,
          operationInProgress: false
        },
        expected: {
          statusLabel: 'Managed by CLI',
          statusKind: 'configured',
          readiness: 'Managed by the CLI.',
          primaryAction: { command: 'openMcpConfiguration', label: 'Open configuration', disabled: false }
        }
      },
      {
        name: 'MALFORMED opens configuration',
        params: {
          supported: true,
          configurationStatus: 'MALFORMED',
          diagnostic: 'Fix the malformed MCP configuration.',
          requiresSetup: false,
          isRemote: false,
          operationInProgress: false
        },
        expected: {
          statusLabel: 'Needs attention',
          statusKind: 'unavailable',
          readiness: 'Fix the malformed MCP configuration.',
          primaryAction: { command: 'openMcpConfiguration', label: 'Open configuration', disabled: false }
        }
      },
      {
        name: 'UNKNOWN opens configuration',
        params: {
          supported: true,
          configurationStatus: 'UNKNOWN',
          diagnostic: 'Could not inspect.',
          requiresSetup: false,
          isRemote: false,
          operationInProgress: false
        },
        expected: {
          statusLabel: 'Needs attention',
          statusKind: 'unavailable',
          readiness: 'Could not inspect.',
          primaryAction: { command: 'openMcpConfiguration', label: 'Open configuration', disabled: false }
        }
      },
      {
        name: 'unsupported is unavailable and disabled',
        params: {
          supported: false,
          requiresSetup: false,
          isRemote: false,
          operationInProgress: false
        },
        expected: {
          statusLabel: 'Unavailable',
          statusKind: 'unavailable',
          readiness: '',
          primaryAction: { command: 'configureMcp', label: 'Set up MCP', disabled: true }
        }
      },
      {
        name: 'operation in progress disables the action',
        params: {
          supported: true,
          configurationStatus: 'NOT_CONFIGURED',
          requiresSetup: false,
          isRemote: false,
          operationInProgress: true
        },
        expected: {
          statusLabel: 'Not configured',
          statusKind: 'notConfigured',
          readiness: '',
          primaryAction: { command: 'configureMcp', label: 'Setting up MCP…', disabled: true }
        }
      }
    ];

    for (const testCase of cases) {
      expect(resolveMcpCard(testCase.params)).to.deep.equal(testCase.expected);
    }
  });
});
