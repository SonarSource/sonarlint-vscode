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
import { AiIntegrationTelemetry } from '../../../src/aiAgentsConfiguration/aiIntegrationTelemetry';
import * as aiAgentUtils from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import { IdeHost } from '../../../src/aiAgentsConfiguration/aiAgentUtils';
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
  let mcpInProgressStub: sinon.SinonStub;

  setup(function () {
    this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
    provider = Object.create(AIAgentsConfigurationWebviewProvider.prototype);
    provider.refreshGeneration = 0;
    mcpInProgressStub = sinon.stub(mcpServerConfig, 'isMCPSetupInProgress').returns(false);
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
      authenticateCliWithConnection: sinon.stub().resolves({
        status: AiIntegration.AuthenticateCliWithConnectionStatus.INTERACTIVE_LOGIN_REQUIRED
      }),
      prepareAuthenticateCliCommand,
      prepareIntegrateCliCommand,
      aiIntegrationAction: sinon.stub().resolves(),
      aiIntegrationCliStateObserved: sinon.stub().resolves(),
      aiAgentIntegrationStateObserved: sinon.stub().resolves()
    };
    provider.telemetry = new AiIntegrationTelemetry(provider.languageClient);
  });

  teardown(() => sinon.restore());

  test('records initial load only once per view opening', async () => {
    const refreshWithObservation = sinon.stub(provider, 'refreshWithObservation').resolves(true);
    provider.initialObservationPending = true;

    await provider.handleMessage({ command: 'ready' });
    await provider.handleMessage({ command: 'ready' });

    expect(refreshWithObservation.firstCall.args[0]).to.equal(true);
    expect(refreshWithObservation.secondCall.args[0]).to.equal(false);
  });

  test('reports a manual refresh action around one eligible observation', async () => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.VSCODE, name: 'VS Code' });
    const refreshWithObservation = sinon.stub(provider, 'refreshWithObservation').resolves(true);

    await provider.refreshOnRequest();

    expect(refreshWithObservation.calledOnceWithExactly(true)).to.be.true;
    const reports = provider.languageClient.aiIntegrationAction.getCalls().map(call => call.args[0]);
    expect(reports.map(report => report.status)).to.deep.equal(['STARTED', 'SUCCEEDED']);
    expect(reports.every(report => report.action === 'REFRESH')).to.be.true;
  });

  test('builds CLI and MCP setup state without legacy fields', async () => {
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([]);

    const state = await provider.buildState();

    expect(state.cli).to.have.all.keys(
      'installationStatus',
      'authenticationStatus',
      'serverUrl',
      'organization',
      'operationInProgress',
      'notice',
      'primaryAction',
      'canIntegrate',
      'uninstallAvailable'
    );
    expect(state.mcp).to.have.all.keys(
      'integrations',
      'configuredCount',
      'configurableCount',
      'operationInProgress'
    );
  });

  test('offers uninstall for any backend-supported local installation, and hides it remotely or when missing', async () => {
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([]);
    sinon.stub(vscode.env, 'remoteName').value(undefined);
    const backendState = cliIntegrationState();
    backendState.cli.uninstallAvailable = true;
    getIntegrationState.resolves(backendState);
    expect((await provider.buildState()).cli.uninstallAvailable).to.be.true;

    sinon.stub(vscode.env, 'remoteName').value('ssh-remote');
    expect((await provider.buildState()).cli.uninstallAvailable).to.be.false;
    sinon.stub(vscode.env, 'remoteName').value(undefined);
    delete backendState.cli.uninstallAvailable;
    expect((await provider.buildState()).cli.uninstallAvailable).to.be.false;
  });

  test('routes uninstall callbacks and opens existing output', async () => {
    const uninstall = sinon.stub(provider.getCliSetup(), 'uninstall').resolves();
    const showOutput = sinon.stub(logging, 'showLogOutput');

    await provider.handleMessage({ command: 'uninstallCli' });
    await provider.handleMessage({ command: 'showCliOutput' });

    expect(uninstall.calledOnce).to.be.true;
    expect(uninstall.firstCall.args).to.have.length(2);
    expect(showOutput.calledOnce).to.be.true;
    expect(provider.languageClient.aiIntegrationAction.notCalled).to.be.true;
  });

  suite('CLI uninstall telemetry', () => {
    let uninstall: sinon.SinonStub;
    let confirm: sinon.SinonStub;
    let refreshAfterAction: sinon.SinonStub;
    let cancellation: vscode.CancellationTokenSource;

    setup(() => {
      sinon.stub(vscode.env, 'remoteName').value(undefined);
      sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.VSCODE, name: 'VS Code' });
      sinon.stub(provider, 'refresh').resolves();
      refreshAfterAction = sinon.stub(provider, 'refreshAfterAction').resolves();
      const state = cliIntegrationState();
      state.cli.uninstallAvailable = true;
      getIntegrationState.resolves(state);
      uninstall = sinon.stub().resolves({ status: AiIntegration.UninstallCliStatus.UNINSTALLED, stdout: '', stderr: '' });
      provider.languageClient.uninstallCli = uninstall;
      confirm = sinon.stub(vscode.window, 'showWarningMessage').resolves('Uninstall' as never);
      cancellation = new vscode.CancellationTokenSource();
      sinon.stub(vscode.window, 'withProgress')
        .callsFake((_options, task) => task({ report: sinon.stub() }, cancellation.token));
      sinon.stub(logging, 'logToSonarLintOutput');
    });

    teardown(() => {
      provider.getCliSetup().dispose();
      cancellation.dispose();
    });

    function expectReports(status: AiIntegration.AiIntegrationActionStatus): void {
      const action = provider.languageClient.aiIntegrationAction;
      expect(action.getCalls().map(call => call.args[0])).to.deep.equal([
        { action: 'UNINSTALL_CLI', status: 'STARTED', agent: null, host: 'VSCODE' },
        { action: 'UNINSTALL_CLI', status, agent: null, host: 'VSCODE' }
      ]);
      expect(action.firstCall.calledBefore(getIntegrationState.firstCall)).to.be.true;
      expect(action.lastCall.calledBefore(refreshAfterAction.firstCall)).to.be.true;
    }

    test('reports an accepted uninstall and successful cleanup warnings', async () => {
      uninstall.resolves({ status: AiIntegration.UninstallCliStatus.UNINSTALLED, stdout: '', stderr: 'Cleanup warning' });

      await provider.handleMessage({ command: 'uninstallCli' });

      expectReports(AiIntegration.AiIntegrationActionStatus.SUCCEEDED);
    });

    test('reports confirmation dismissal as cancelled', async () => {
      confirm.resolves(undefined);

      await provider.handleMessage({ command: 'uninstallCli' });

      expectReports(AiIntegration.AiIntegrationActionStatus.CANCELLED);
      expect(uninstall.notCalled).to.be.true;
    });

    test('reports an RPC error once as failed', async () => {
      uninstall.rejects(new Error('transport failed'));

      await provider.handleMessage({ command: 'uninstallCli' });

      expectReports(AiIntegration.AiIntegrationActionStatus.FAILED);
    });

    test('keeps a future backend status unknown', async () => {
      uninstall.resolves({ status: 99, stdout: '', stderr: '' });

      await provider.handleMessage({ command: 'uninstallCli' });

      expectReports(AiIntegration.AiIntegrationActionStatus.UNKNOWN);
    });

    test('guarded remote and disposed requests emit no actions', async () => {
      sinon.stub(vscode.env, 'remoteName').value('ssh-remote');
      await provider.handleMessage({ command: 'uninstallCli' });
      sinon.stub(vscode.env, 'remoteName').value(undefined);
      provider.getCliSetup().dispose();
      await provider.handleMessage({ command: 'uninstallCli' });

      expect(provider.languageClient.aiIntegrationAction.notCalled).to.be.true;
      expect(getIntegrationState.notCalled).to.be.true;
    });

    test('notification transport failures preserve the uninstall result and release the lock', async () => {
      provider.languageClient.aiIntegrationAction.rejects(new Error('telemetry failed'));

      await provider.handleMessage({ command: 'uninstallCli' });

      expectReports(AiIntegration.AiIntegrationActionStatus.SUCCEEDED);
      expect(uninstall.calledOnce).to.be.true;
      expect(provider.getCliSetup().operationInProgress).to.be.false;
    });

    test('a failed refresh cannot replace or duplicate the successful terminal notification', async () => {
      const failure = new Error('refresh failed');
      refreshAfterAction.rejects(failure);

      try {
        await provider.handleMessage({ command: 'uninstallCli' });
        expect.fail('refresh should fail');
      } catch (error) {
        expect(error).to.equal(failure);
      }

      expectReports(AiIntegration.AiIntegrationActionStatus.SUCCEEDED);
      expect(provider.getCliSetup().operationInProgress).to.be.false;
    });
  });

  function cliIntegrationState(
    cliIntegrations?: AiIntegration.CliIntegrationState[] | null
  ): AiIntegration.GetAiIntegrationStateResponse {
    return {
      cli: {
        installationStatus: AiIntegration.CliInstallationStatus.INSTALLED,
        authenticationStatus: AiIntegration.CliAuthenticationStatus.AUTHENTICATED
      },
      agents: [{
        agent: AiIntegration.AiAgent.CODEX,
        detectionSources: [AiIntegration.AiAgentDetectionSource.CLI],
        cliIntegrationSupported: true,
        standaloneMcpSupported: false
      }],
      connectionChoices: [],
      cliIntegrations
    };
  }

  test('maps recording ordinals independently of configuration health', async () => {
    for (const [recordingStatus, expected] of [
      [AiIntegration.CliIntegrationRecordingStatus.RECORDED, 'RECORDED'],
      [AiIntegration.CliIntegrationRecordingStatus.NOT_RECORDED, 'NOT_RECORDED'],
      [AiIntegration.CliIntegrationRecordingStatus.UNKNOWN, 'UNKNOWN'],
      [99 as AiIntegration.CliIntegrationRecordingStatus, 'UNKNOWN']
    ] as const) {
      getIntegrationState.resolves(cliIntegrationState([{
        agent: AiIntegration.AiAgent.CODEX,
        recordingStatus,
        configurations: [{ mcp: AiIntegration.CliIntegrationCheckStatus.INVALID }]
      }]));

      const state = await provider.buildState();

      expect(state.agents[0].recordingStatus).to.equal(expected);
    }
  });

  test('falls back to unknown for old responses and missing agent records', async () => {
    for (const cliIntegrations of [undefined, null, [], [{
      agent: AiIntegration.AiAgent.CLAUDE_CODE,
      recordingStatus: AiIntegration.CliIntegrationRecordingStatus.RECORDED,
      configurations: []
    }]]) {
      const response = cliIntegrationState(cliIntegrations);
      if (cliIntegrations === undefined) {
        delete response.cliIntegrations;
      }
      getIntegrationState.resolves(response);

      const state = await provider.buildState();

      expect(state.agents[0].recordingStatus).to.equal('UNKNOWN');
      expect(state.agents[0].configurationPaths).to.deep.equal([]);
    }
  });

  test('preserves duplicate and pathless configuration paths', async () => {
    getIntegrationState.resolves(cliIntegrationState([{
      agent: AiIntegration.AiAgent.CODEX,
      recordingStatus: AiIntegration.CliIntegrationRecordingStatus.RECORDED,
      configurations: [
        { path: '/project/config', mcp: 0, hooks: 1 },
        { path: '/project/config', hooks: 2 },
        { mcp: 3, hooks: null },
        { path: null },
        {}
      ]
    }]));

    const state = await provider.buildState();

    expect(state.agents[0].configurationPaths).to.deep.equal(['/project/config', '/project/config', null, null, null]);
  });

  test('does not infer detection from recorded integrations', async () => {
    const response = cliIntegrationState([{
      agent: AiIntegration.AiAgent.CODEX,
      recordingStatus: AiIntegration.CliIntegrationRecordingStatus.RECORDED,
      configurations: []
    }]);
    response.agents[0].detectionSources = [];
    getIntegrationState.resolves(response);

    const state = await provider.buildState();

    expect(state.agents).to.deep.equal([]);
  });

  test('recording status leaves authentication, remote and setup gates in force', async () => {
    const response = cliIntegrationState([{
      agent: AiIntegration.AiAgent.CODEX,
      recordingStatus: AiIntegration.CliIntegrationRecordingStatus.RECORDED,
      configurations: []
    }]);
    const remote = sinon.stub(vscode.env, 'remoteName').value(undefined);
    getIntegrationState.resolves(response);
    expect((await provider.buildState()).cli.canIntegrate).to.be.true;
    response.cli.authenticationStatus = AiIntegration.CliAuthenticationStatus.UNAUTHENTICATED;
    expect((await provider.buildState()).cli.canIntegrate).to.be.false;
    response.cli.authenticationStatus = AiIntegration.CliAuthenticationStatus.AUTHENTICATED;
    remote.value('ssh-remote');
    expect((await provider.buildState()).cli.canIntegrate).to.be.false;
    remote.value(undefined);
    provider.cliSetupSession = { operationInProgress: true };
    expect((await provider.buildState()).cli.canIntegrate).to.be.false;
  });

  test('builds independent MCP state for detected agents', async () => {
    const detectedAgents = [
      { id: AiIntegration.AiAgent.GITHUB_COPILOT, name: 'Copilot in VS Code', source: 'extension' as const },
      { id: AiIntegration.AiAgent.CLAUDE_CODE, name: 'Claude Code', source: 'extension' as const },
      { id: AiIntegration.AiAgent.CODEX, name: 'Codex', source: 'extension' as const }
    ];
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.VSCODE, name: 'VS Code' });
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns(detectedAgents);
    sinon.stub(aiAgentUtils, 'isAgentActiveForMcp').returns(true);
    getIntegrationState.resolves({
      cli: {
        installationStatus: 1,
        authenticationStatus: 0
      },
      agents: detectedAgents.map(agent => ({
        agent: agent.id,
        detectionSources: [AiIntegration.AiAgentDetectionSource.IDE],
        cliIntegrationSupported: agent.id === AiIntegration.AiAgent.CODEX,
        standaloneMcpSupported: agent.id !== AiIntegration.AiAgent.CODEX
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

    const state = await provider.buildState(true);

    const cliReport = provider.languageClient.aiIntegrationCliStateObserved;
    const agentReport = provider.languageClient.aiAgentIntegrationStateObserved;
    expect(cliReport.calledOnce).to.be.true;
    expect(cliReport.firstCall.args[0]).to.include({
      installationStatus: 'INSTALLED',
      authenticationStatus: 'AUTHENTICATED',
      host: 'VSCODE'
    });
    expect(agentReport.callCount).to.equal(3);
    expect(agentReport.getCalls().map(call => call.args[0].agent)).to.have.members([
      'GITHUB_COPILOT', 'CLAUDE_CODE', 'CODEX'
    ]);
    expect(agentReport.getCalls().find(call => call.args[0].agent === 'CODEX').args[0].standaloneMcpState)
      .to.equal('UNKNOWN');

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
      operationInProgress: false
    });
  });

  test('omits inactive Copilot from standalone MCP rows', async () => {
    const detectedAgents = [
      { id: AiIntegration.AiAgent.GITHUB_COPILOT, name: 'Copilot in VS Code', source: 'extension' as const },
      { id: AiIntegration.AiAgent.CLAUDE_CODE, name: 'Claude Code', source: 'extension' as const }
    ];
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.VSCODE, name: 'VS Code' });
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns(detectedAgents);
    sinon
      .stub(aiAgentUtils, 'isAgentActiveForMcp')
      .callsFake(agent => agent !== AiIntegration.AiAgent.GITHUB_COPILOT);
    getIntegrationState.resolves({
      cli: {
        installationStatus: AiIntegration.CliInstallationStatus.NOT_INSTALLED,
        authenticationStatus: AiIntegration.CliAuthenticationStatus.UNKNOWN
      },
      agents: detectedAgents.map(agent => ({
        agent: agent.id,
        detectionSources: [AiIntegration.AiAgentDetectionSource.IDE],
        cliIntegrationSupported: false,
        standaloneMcpSupported: true
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
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.VSCODE, name: 'VS Code' });
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([
      { id: AiIntegration.AiAgent.GITHUB_COPILOT, name: 'Copilot in VS Code', source: 'extension' }
    ]);
    sinon.stub(aiAgentUtils, 'isAgentActiveForMcp').returns(true);
    const capability = (
      agent: AiIntegration.AiAgent,
      detectionSources: AiIntegration.AiAgentDetectionSource[],
      standaloneMcpSupported: boolean
    ) => ({
      agent,
      detectionSources,
      cliIntegrationSupported: true,
      standaloneMcpSupported
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
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns(detectedAgents);
    getIntegrationState.resolves({
      cli: {
        installationStatus: AiIntegration.CliInstallationStatus.NOT_INSTALLED,
        authenticationStatus: AiIntegration.CliAuthenticationStatus.UNKNOWN
      },
      agents: detectedAgents.map(agent => ({
        agent: agent.id,
        detectionSources: [AiIntegration.AiAgentDetectionSource.IDE],
        cliIntegrationSupported: false,
        standaloneMcpSupported: true
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

  test('shows an existing standalone config as configured', async () => {
    const cursor = { id: AiIntegration.AiAgent.CURSOR, name: 'Cursor', source: 'ide' as const };
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.CURSOR, name: 'Cursor' });
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([cursor]);
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
          standaloneMcpSupported: true
        }
      ],
      connectionChoices: []
    });
    sinon.stub(mcpServerConfig, 'inspectMCPConfiguration').resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      diagnostics: []
    });

    const state = await provider.buildState();

    expect(state.mcp.integrations[0].configurationStatus).to.equal('STANDALONE');
    expect(state.mcp.integrations[0].diagnostic).to.be.undefined;
  });

  test('exposes malformed and CLI-managed states independently', async () => {
    const detectedAgents = [
      { id: AiIntegration.AiAgent.CURSOR, name: 'Cursor', source: 'ide' as const },
      { id: AiIntegration.AiAgent.CLAUDE_CODE, name: 'Claude Code', source: 'extension' as const }
    ];
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.CURSOR, name: 'Cursor' });
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns(detectedAgents);
    getIntegrationState.resolves({
      cli: {
        installationStatus: AiIntegration.CliInstallationStatus.NOT_INSTALLED,
        authenticationStatus: AiIntegration.CliAuthenticationStatus.UNKNOWN
      },
      agents: detectedAgents.map(agent => ({
        agent: agent.id,
        detectionSources: [AiIntegration.AiAgentDetectionSource.IDE],
        cliIntegrationSupported: false,
        standaloneMcpSupported: true
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

  test('preserves an unusable CLI status', async () => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IdeHost.VSCODE, name: 'VS Code' });
    sinon
      .stub(aiAgentUtils, 'getDetectedIdeAgents')
      .returns([{ id: AiIntegration.AiAgent.CODEX, name: 'Codex', source: 'extension' }]);
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
          standaloneMcpSupported: false
        }
      ],
      connectionChoices: []
    });

    const state = await provider.buildState();

    expect(state.cli.installationStatus).to.equal('UNUSABLE');
    expect(state.agents[0].supportsCliIntegration).to.be.true;
  });

  test('refreshes recorded integration state after CLI setup completes', async () => {
    const response = cliIntegrationState([{
      agent: AiIntegration.AiAgent.CODEX,
      recordingStatus: AiIntegration.CliIntegrationRecordingStatus.NOT_RECORDED,
      configurations: []
    }]);
    getIntegrationState.resolves(response);
    const postMessage = sinon.stub().resolves();
    provider.view = { webview: { postMessage } };
    const terminal = { show: sinon.stub() };
    sinon.stub(vscode.window, 'createTerminal').returns(terminal as unknown as vscode.Terminal);
    sinon.stub(vscode.window, 'onDidCloseTerminal').returns({ dispose: sinon.stub() });
    prepareIntegrateCliCommand.resolves({ executable: '/usr/local/bin/sonar', arguments: ['integrate', 'codex'], interactive: true });

    await provider.handleMessage({ command: 'integrateAgent', agent: AiIntegration.AiAgent.CODEX });
    expect(postMessage.firstCall.args[0].state.agents[0].recordingStatus).to.equal('NOT_RECORDED');
    response.cliIntegrations[0].recordingStatus = AiIntegration.CliIntegrationRecordingStatus.RECORDED;
    await provider.cliSetupSession.handleTerminalClosed({ code: 0, reason: vscode.TerminalExitReason.Process });

    expect(postMessage.lastCall.args[0].state.agents[0].recordingStatus).to.equal('RECORDED');
    expect(provider.languageClient.aiIntegrationCliStateObserved.calledOnce).to.be.true;
  });

  test('routes MCP setup through the existing command', async () => {
    const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();

    await provider.handleMessage({ command: 'configureMcp', agent: AiIntegration.AiAgent.CURSOR });

    expect(executeCommand.calledOnceWithExactly(
      Commands.CONFIGURE_MCP_SERVER,
      AiIntegration.AiAgent.CURSOR
    )).to.be.true;
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

  test('reuses and reveals the installation terminal on a repeated setup request', async () => {
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
    expect(provider.extensionContext.subscriptions).to.deep.equal([provider.cliSetupSession, closeListener]);

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
          standaloneMcpSupported: true
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
        standaloneMcpSupported: false
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
    mcpInProgressStub.returns(true);
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
});
