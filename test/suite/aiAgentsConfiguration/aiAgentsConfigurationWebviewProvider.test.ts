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
import { INTEGRATION_TARGET, IDE_HOST } from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import * as mcpServerConfig from '../../../src/aiAgentsConfiguration/mcpServerConfig';
import { ExtendedServer } from '../../../src/lsp/protocol';
import { Commands } from '../../../src/util/commands';
import { SETUP_TEARDOWN_HOOK_TIMEOUT } from '../commons';

suite('AIAgentsConfigurationWebviewProvider', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let provider: any;
  let getIntegrationState: sinon.SinonStub;
  let prepareCliCommand: sinon.SinonStub;

  setup(function () {
    this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
    provider = Object.create(AIAgentsConfigurationWebviewProvider.prototype);
    provider.setupInProgress = false;
    getIntegrationState = sinon.stub().resolves({
      cli: {
        installationStatus: ExtendedServer.CliInstallationStatus.NOT_INSTALLED,
        authenticationStatus: ExtendedServer.CliAuthenticationStatus.UNKNOWN
      },
      agents: [],
      connectionChoices: []
    });
    prepareCliCommand = sinon.stub();
    provider.aiIntegrationService = { getIntegrationState, prepareCliCommand };
  });

  teardown(() => sinon.restore());

  test('builds the CLI and MCP card state', async () => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IDE_HOST.VS_CODE, name: 'VS Code' });
    sinon.stub(aiAgentUtils, 'getCurrentIntegrationTargetWithMCPSupport').returns(INTEGRATION_TARGET.GITHUB_COPILOT);
    sinon.stub(aiAgentUtils, 'getCurrentIntegrationTargetWithHookSupport').returns(undefined);
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([
      {
        id: INTEGRATION_TARGET.CODEX,
        name: 'Codex',
        source: 'extension'
      }
    ]);
    getIntegrationState.resolves({
      cli: {
        installationStatus: ExtendedServer.CliInstallationStatus.INSTALLED,
        authenticationStatus: ExtendedServer.CliAuthenticationStatus.AUTHENTICATED
      },
      agents: [
        {
          agent: ExtendedServer.AiAgent.CODEX,
          cliIntegrationSupported: false,
          standaloneMcpSupported: true,
          hookSupported: true,
          skillSupported: true
        }
      ],
      connectionChoices: []
    });
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(true);
    sinon.stub(mcpServerConfig, 'getCurrentSonarQubeMCPServerConfig').returns({
      command: 'docker',
      args: ['run'],
      env: {}
    });

    const state = await provider.buildState();

    expect(state.ideName).to.equal('VS Code');
    expect(
      getIntegrationState.calledOnceWithExactly(
        IDE_HOST.VS_CODE,
        [INTEGRATION_TARGET.CODEX],
        ExtendedServer.AiIntegrationScope.GLOBAL
      )
    ).to.be.true;
    expect(state.agents[0].supportsCliIntegration).to.be.false;
    expect(state.cli).to.deep.equal({
      installationStatus: 'INSTALLED',
      authenticationStatus: 'AUTHENTICATED',
      serverUrl: undefined,
      organization: undefined,
      operationInProgress: false,
      hook: { supported: false, configured: false }
    });
    expect(state.mcp).to.deep.equal({
      supported: true,
      configured: true,
      agentName: undefined,
      legacyInstructionsConfigured: true
    });
  });

  test('includes the current IDE hook state and hides absent legacy instructions', async () => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IDE_HOST.WINDSURF, name: 'Windsurf' });
    sinon.stub(aiAgentUtils, 'getCurrentIntegrationTargetWithMCPSupport').returns(INTEGRATION_TARGET.WINDSURF);
    sinon.stub(aiAgentUtils, 'getCurrentIntegrationTargetWithHookSupport').returns(INTEGRATION_TARGET.WINDSURF);
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([]);
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);
    sinon.stub(aiAgentHooks, 'isHookInstalled').resolves(true);
    sinon.stub(mcpServerConfig, 'getCurrentSonarQubeMCPServerConfig').returns(undefined);

    const state = await provider.buildState();

    expect(state.cli).to.deep.equal({
      installationStatus: 'NOT_INSTALLED',
      authenticationStatus: 'UNKNOWN',
      serverUrl: undefined,
      organization: undefined,
      operationInProgress: false,
      hook: { supported: true, configured: true }
    });
    expect(state.mcp.legacyInstructionsConfigured).to.be.false;
  });

  test('preserves an unusable CLI status without enabling unsupported local integrations', async () => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IDE_HOST.VS_CODE, name: 'VS Code' });
    sinon.stub(aiAgentUtils, 'getCurrentIntegrationTargetWithMCPSupport').returns(undefined);
    sinon.stub(aiAgentUtils, 'getCurrentIntegrationTargetWithHookSupport').returns(undefined);
    sinon
      .stub(aiAgentUtils, 'getDetectedIdeAgents')
      .returns([{ id: INTEGRATION_TARGET.CODEX, name: 'Codex', source: 'extension' }]);
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);
    sinon.stub(mcpServerConfig, 'getCurrentSonarQubeMCPServerConfig').returns(undefined);
    getIntegrationState.resolves({
      cli: {
        installationStatus: ExtendedServer.CliInstallationStatus.UNUSABLE,
        authenticationStatus: ExtendedServer.CliAuthenticationStatus.UNKNOWN
      },
      agents: [
        {
          agent: ExtendedServer.AiAgent.CODEX,
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
      hook: { supported: false, configured: false }
    });
    expect(state.agents[0].supportsCliIntegration).to.be.true;
    expect(state.mcp.supported).to.be.false;
  });

  test('shows a generic error state and recovers on a later refresh', async () => {
    const postMessage = sinon.stub().resolves();
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
  });

  test('routes MCP setup through the existing command and refreshes state', async () => {
    const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'configureMcp' });

    expect(executeCommand.calledOnceWith(Commands.CONFIGURE_MCP_SERVER)).to.be.true;
    expect(provider.refresh.calledOnce).to.be.true;
  });

  test('opens hook configuration from the CLI card', async () => {
    const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();

    await provider.handleMessage({ command: 'openHook' });

    expect(executeCommand.calledOnceWith(Commands.OPEN_AI_AGENT_HOOK_CONFIGURATION)).to.be.true;
  });

  test('opens the Vortex documentation from the CLI card', async () => {
    const openExternal = sinon.stub(vscode.env, 'openExternal').resolves(true);

    await provider.handleMessage({ command: 'openVortexDocumentation' });

    expect(openExternal.calledOnceWith(vscode.Uri.parse('https://www.sonarsource.com/blog/introducing-sonar-vortex/')))
      .to.be.true;
  });

  test('runs the prepared installation command in one visible terminal', async () => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IDE_HOST.VS_CODE, name: 'VS Code' });
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([]);
    const terminal = { show: sinon.stub() };
    const createTerminal = sinon.stub(vscode.window, 'createTerminal').returns(terminal as unknown as vscode.Terminal);
    const onDidCloseTerminal = sinon.stub(vscode.window, 'onDidCloseTerminal').returns({ dispose: sinon.stub() });
    getIntegrationState.resolves({
      cli: {
        installationStatus: ExtendedServer.CliInstallationStatus.NOT_INSTALLED,
        authenticationStatus: ExtendedServer.CliAuthenticationStatus.UNKNOWN
      },
      agents: [],
      connectionChoices: []
    });
    prepareCliCommand.resolves({
      executable: '/bin/sh',
      arguments: ['-c', 'install-sonar'],
      interactive: false
    });
    provider.extensionContext = { subscriptions: [] };
    provider.refresh = sinon.stub().resolves();
    provider.handleSetupTerminalClosed = sinon.stub().resolves();

    await provider.handleMessage({ command: 'installCli' });
    await provider.handleMessage({ command: 'installCli' });

    expect(
      prepareCliCommand.calledOnceWithExactly({
        action: ExtendedServer.CliCommandAction.INSTALL
      })
    ).to.be.true;
    expect(
      createTerminal.calledOnceWithExactly({
        name: 'SonarQube CLI installation',
        shellPath: '/bin/sh',
        shellArgs: ['-c', 'install-sonar'],
        cwd: os.homedir()
      })
    ).to.be.true;
    expect(terminal.show.calledTwice).to.be.true;

    const exitStatus = { code: undefined, reason: vscode.TerminalExitReason.User };
    Object.assign(terminal, { exitStatus });
    onDidCloseTerminal.firstCall.args[0](terminal as unknown as vscode.Terminal);
    expect(provider.handleSetupTerminalClosed.calledOnceWithExactly(exitStatus)).to.be.true;
  });

  test('prepares login with the recommended IDE connection', async () => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IDE_HOST.VS_CODE, name: 'VS Code' });
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([]);
    const terminal = { show: sinon.stub() };
    sinon.stub(vscode.window, 'createTerminal').returns(terminal as unknown as vscode.Terminal);
    sinon.stub(vscode.window, 'onDidCloseTerminal').returns({ dispose: sinon.stub() });
    getIntegrationState.resolves({
      cli: {
        installationStatus: ExtendedServer.CliInstallationStatus.INSTALLED,
        authenticationStatus: ExtendedServer.CliAuthenticationStatus.UNAUTHENTICATED
      },
      agents: [],
      connectionChoices: [{ connectionId: 'cloud', serverUrl: 'https://sonarcloud.io', organization: 'example' }],
      recommendedConnectionId: 'cloud'
    });
    prepareCliCommand.resolves({
      executable: '/usr/local/bin/sonar',
      arguments: ['auth', 'login', '--server', 'https://sonarcloud.io', '--org', 'example'],
      interactive: true
    });
    provider.extensionContext = { subscriptions: [] };
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'authenticateCli' });

    expect(
      prepareCliCommand.calledOnceWithExactly({
        action: ExtendedServer.CliCommandAction.AUTHENTICATE,
        serverUrl: 'https://sonarcloud.io',
        organization: 'example'
      })
    ).to.be.true;
    expect(terminal.show.calledOnce).to.be.true;
  });

  test('allows login when existing CLI authentication could not be verified', async () => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IDE_HOST.VS_CODE, name: 'VS Code' });
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([]);
    const terminal = { show: sinon.stub() };
    sinon.stub(vscode.window, 'createTerminal').returns(terminal as unknown as vscode.Terminal);
    sinon.stub(vscode.window, 'onDidCloseTerminal').returns({ dispose: sinon.stub() });
    getIntegrationState.resolves({
      cli: {
        installationStatus: ExtendedServer.CliInstallationStatus.INSTALLED,
        authenticationStatus: ExtendedServer.CliAuthenticationStatus.UNVERIFIED
      },
      agents: [],
      connectionChoices: [{ connectionId: 'server', serverUrl: 'https://server.example' }]
    });
    prepareCliCommand.resolves({
      executable: '/usr/local/bin/sonar',
      arguments: ['auth', 'login', '--server', 'https://server.example'],
      interactive: true
    });
    provider.extensionContext = { subscriptions: [] };
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'authenticateCli' });

    expect(
      prepareCliCommand.calledOnceWithExactly({
        action: ExtendedServer.CliCommandAction.AUTHENTICATE,
        serverUrl: 'https://server.example'
      })
    ).to.be.true;
  });

  test('reports a cancelled login connection selection without starting a command', async () => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IDE_HOST.VS_CODE, name: 'VS Code' });
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([]);
    sinon.stub(vscode.window, 'showQuickPick').resolves(undefined);
    getIntegrationState.resolves({
      cli: {
        installationStatus: ExtendedServer.CliInstallationStatus.INSTALLED,
        authenticationStatus: ExtendedServer.CliAuthenticationStatus.UNAUTHENTICATED
      },
      agents: [],
      connectionChoices: [
        { connectionId: 'server', serverUrl: 'https://server.example' },
        { connectionId: 'cloud', serverUrl: 'https://sonarcloud.io', organization: 'example' }
      ]
    });
    const postMessage = sinon.stub().resolves();
    provider.view = { webview: { postMessage } };
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'authenticateCli' });

    expect(prepareCliCommand.notCalled).to.be.true;
    expect(
      postMessage.calledOnceWithExactly({
        command: 'setupOutcome',
        outcome: 'cancelled',
        message: 'SonarQube CLI login was cancelled.'
      })
    ).to.be.true;
    expect(provider.setupInProgress).to.be.false;
  });

  test('runs supported agent integration interactively', async () => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IDE_HOST.VS_CODE, name: 'VS Code' });
    sinon
      .stub(aiAgentUtils, 'getDetectedIdeAgents')
      .returns([{ id: INTEGRATION_TARGET.CLAUDE_CODE, name: 'Claude Code', source: 'extension' }]);
    const terminal = { show: sinon.stub() };
    sinon.stub(vscode.window, 'createTerminal').returns(terminal as unknown as vscode.Terminal);
    sinon.stub(vscode.window, 'onDidCloseTerminal').returns({ dispose: sinon.stub() });
    getIntegrationState.resolves({
      cli: {
        installationStatus: ExtendedServer.CliInstallationStatus.INSTALLED,
        authenticationStatus: ExtendedServer.CliAuthenticationStatus.AUTHENTICATED
      },
      agents: [
        {
          agent: ExtendedServer.AiAgent.CLAUDE_CODE,
          cliIntegrationSupported: true,
          standaloneMcpSupported: true,
          hookSupported: true,
          skillSupported: true
        }
      ],
      connectionChoices: []
    });
    prepareCliCommand.resolves({
      executable: '/usr/local/bin/sonar',
      arguments: ['integrate', 'claude', '--global'],
      interactive: true
    });
    provider.extensionContext = { subscriptions: [] };
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'integrateAgent', agent: INTEGRATION_TARGET.CLAUDE_CODE });

    expect(
      prepareCliCommand.calledOnceWithExactly({
        action: ExtendedServer.CliCommandAction.INTEGRATE,
        agent: ExtendedServer.AiAgent.CLAUDE_CODE
      })
    ).to.be.true;
    expect(terminal.show.calledOnce).to.be.true;
  });

  test('refreshes after terminal closure and reports only its observable exit result', async () => {
    const postMessage = sinon.stub().resolves();
    provider.view = { webview: { postMessage } };
    provider.refresh = sinon.stub().resolves();

    await provider.handleSetupTerminalClosed({ code: 0, reason: vscode.TerminalExitReason.Process });
    await provider.handleSetupTerminalClosed({ code: 0, reason: vscode.TerminalExitReason.User });
    await provider.handleSetupTerminalClosed(undefined);
    await provider.handleSetupTerminalClosed({ code: 1, reason: vscode.TerminalExitReason.Process });

    expect(provider.refresh.callCount).to.equal(4);
    expect(postMessage.firstCall.args[0]).to.deep.include({ command: 'setupOutcome', outcome: 'completed' });
    expect(postMessage.secondCall.args[0]).to.deep.include({ command: 'setupOutcome', outcome: 'cancelled' });
    expect(postMessage.thirdCall.args[0]).to.deep.include({ command: 'setupOutcome', outcome: 'unknown' });
    expect(postMessage.getCall(3).args[0]).to.deep.include({ command: 'setupOutcome', outcome: 'failed' });
  });

  test('opens only existing legacy instructions and refreshes stale state', async () => {
    const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'openLegacyInstructions' });

    expect(executeCommand.calledOnceWith(Commands.OPEN_SONARQUBE_RULES_FILE, false)).to.be.true;
    expect(provider.refresh.calledOnce).to.be.true;
  });
});
