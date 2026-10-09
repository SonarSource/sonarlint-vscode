/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ErrorCodes, ResponseError } from 'vscode-languageclient/node';
import {
  canIntegrateAgent,
  CliSetupSession,
  resolveCliPrimaryAction,
  selectConnection
} from '../../../src/aiAgentsConfiguration/cliSetup';
import { AiIntegration } from '../../../src/lsp/aiIntegrationProtocol';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';
import * as logging from '../../../src/util/logging';
import { SETUP_TEARDOWN_HOOK_TIMEOUT } from '../commons';

const INSTALLED = AiIntegration.CliInstallationStatus.INSTALLED;
const NOT_INSTALLED = AiIntegration.CliInstallationStatus.NOT_INSTALLED;
const UNUSABLE = AiIntegration.CliInstallationStatus.UNUSABLE;
const AUTHENTICATED = AiIntegration.CliAuthenticationStatus.AUTHENTICATED;
const UNAUTHENTICATED = AiIntegration.CliAuthenticationStatus.UNAUTHENTICATED;
const INVALID = AiIntegration.CliAuthenticationStatus.INVALID;
const UNVERIFIED = AiIntegration.CliAuthenticationStatus.UNVERIFIED;
const UNAVAILABLE = AiIntegration.CliAuthenticationStatus.UNAVAILABLE;
const UNKNOWN = AiIntegration.CliAuthenticationStatus.UNKNOWN;

suite('cliSetup', () => {
  setup(function () {
    this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
  });

  teardown(() => sinon.restore());

  test('resolves a single primary action from CLI state', () => {
    expect(resolveCliPrimaryAction(NOT_INSTALLED, UNKNOWN, true)).to.deep.equal({
      command: 'openCliDocumentation',
      label: 'View installation guide'
    });
    expect(resolveCliPrimaryAction(NOT_INSTALLED, UNKNOWN, false)).to.deep.equal({
      command: 'installCli',
      label: 'Install SonarQube CLI'
    });
    expect(resolveCliPrimaryAction(UNUSABLE, UNKNOWN, false)).to.deep.equal({
      command: 'openCliDocumentation',
      label: 'Open troubleshooting guide'
    });
    expect(resolveCliPrimaryAction(INSTALLED, UNAUTHENTICATED, false)).to.deep.equal({
      command: 'authenticateCli',
      label: 'Sign in with SonarQube CLI'
    });
    expect(resolveCliPrimaryAction(INSTALLED, INVALID, false)?.command).to.equal('authenticateCli');
    expect(resolveCliPrimaryAction(INSTALLED, UNVERIFIED, false)?.command).to.equal('authenticateCli');
    expect(resolveCliPrimaryAction(INSTALLED, UNAVAILABLE, false)).to.deep.equal({
      command: 'refresh',
      label: 'Refresh'
    });
    expect(resolveCliPrimaryAction(INSTALLED, UNKNOWN, false)?.command).to.equal('refresh');
    expect(resolveCliPrimaryAction(INSTALLED, AUTHENTICATED, false)).to.be.undefined;
  });

  test('matches the enum ordinals used by the language server', () => {
    expect(NOT_INSTALLED).to.equal(0);
    expect(UNKNOWN).to.equal(5);
    expect(AiIntegration.AiAgent.CLAUDE_CODE).to.equal(4);
    expect(AiIntegration.AiAgentDetectionSource.CLI).to.equal(1);
    expect(AiIntegration.McpConfigurationState.CLI_MANAGED).to.equal(2);
  });

  test('allows agent integration only when local CLI auth is ready', () => {
    expect(canIntegrateAgent(INSTALLED, AUTHENTICATED, false, false)).to.be.true;
    expect(canIntegrateAgent(INSTALLED, AUTHENTICATED, false, true)).to.be.false;
    expect(canIntegrateAgent(INSTALLED, AUTHENTICATED, true, false)).to.be.false;
    expect(canIntegrateAgent(INSTALLED, UNAUTHENTICATED, false, false)).to.be.false;
    expect(canIntegrateAgent(NOT_INSTALLED, AUTHENTICATED, false, false)).to.be.false;
  });

  test('selects the recommended connection, a single choice, or none', async () => {
    const cloud = { connectionId: 'cloud', serverUrl: 'https://sonarcloud.io', organization: 'example' };
    const server = { connectionId: 'server', serverUrl: 'https://server.example' };

    expect(
      await selectConnection({
        cli: { installationStatus: INSTALLED, authenticationStatus: UNAUTHENTICATED },
        agents: [],
        connectionChoices: [cloud, server],
        recommendedConnectionId: 'cloud'
      })
    ).to.deep.equal({ kind: 'connection', connection: cloud });

    expect(
      await selectConnection({
        cli: { installationStatus: INSTALLED, authenticationStatus: UNAUTHENTICATED },
        agents: [],
        connectionChoices: [server]
      })
    ).to.deep.equal({ kind: 'connection', connection: server });

    expect(
      await selectConnection({
        cli: { installationStatus: INSTALLED, authenticationStatus: UNAUTHENTICATED },
        agents: [],
        connectionChoices: []
      })
    ).to.deep.equal({ kind: 'none' });
  });

  test('reports a cancelled connection pick when the user dismisses Quick Pick', async () => {
    sinon.stub(vscode.window, 'showQuickPick').resolves(undefined);

    expect(
      await selectConnection({
        cli: { installationStatus: INSTALLED, authenticationStatus: UNAUTHENTICATED },
        agents: [],
        connectionChoices: [
          { connectionId: 'server', serverUrl: 'https://server.example' },
          { connectionId: 'cloud', serverUrl: 'https://sonarcloud.io', organization: 'example' }
        ]
      })
    ).to.deep.equal({ kind: 'cancelled' });
  });

  test('finishes CLI telemetry only after the setup terminal exits', async () => {
    const onFinished = sinon.stub().resolves();
    const terminal = { show: sinon.stub() } as unknown as vscode.Terminal;
    sinon.stub(vscode.window, 'createTerminal').returns(terminal);
    sinon.stub(vscode.window, 'onDidCloseTerminal').returns({ dispose: sinon.stub() });
    const session = new CliSetupSession(
      { subscriptions: [] } as unknown as vscode.ExtensionContext,
      {
        getAiIntegrationState: sinon.stub().resolves({
          cli: {
            installationStatus: NOT_INSTALLED,
            authenticationStatus: UNKNOWN
          },
          agents: [],
          connectionChoices: []
        }),
        prepareInstallCliCommand: sinon.stub().resolves({
          executable: 'sonar',
          arguments: ['install'],
          interactive: true
        })
      } as never,
      sinon.stub().resolves(),
      onFinished
    );

    await session.run('install');
    expect(onFinished.notCalled).to.be.true;

    await session.handleTerminalClosed({ code: 0, reason: vscode.TerminalExitReason.Process });
    expect(onFinished.calledOnce).to.be.true;
    expect(onFinished.firstCall.args[2]).to.deep.equal({ status: 'SUCCEEDED' });
  });

  test('finishes an unsupported CLI attempt before opening a terminal', async () => {
    const onFinished = sinon.stub().resolves();
    const session = new CliSetupSession(
      { subscriptions: [] } as unknown as vscode.ExtensionContext,
      {
        getAiIntegrationState: sinon.stub().resolves({
          cli: {
            installationStatus: INSTALLED,
            authenticationStatus: AUTHENTICATED
          },
          agents: [],
          connectionChoices: []
        })
      } as never,
      sinon.stub().resolves(),
      onFinished
    );

    await session.run('install');

    expect(onFinished.calledOnce).to.be.true;
    expect(onFinished.firstCall.args[2]).to.deep.equal({ status: 'FAILED' });
  });

  test('shows in-progress state before the setup terminal opens', async () => {
    const terminal = { show: sinon.stub() } as unknown as vscode.Terminal;
    const createTerminal = sinon.stub(vscode.window, 'createTerminal').returns(terminal);
    sinon.stub(vscode.window, 'onDidCloseTerminal').returns({ dispose: sinon.stub() });
    let session!: CliSetupSession;
    let refreshedWhileInProgress = false;
    const onChange = sinon.stub().callsFake(() => {
      refreshedWhileInProgress = session.operationInProgress && createTerminal.notCalled;
      return Promise.resolve();
    });
    session = new CliSetupSession(
      { subscriptions: [] } as unknown as vscode.ExtensionContext,
      {
        getAiIntegrationState: sinon.stub().resolves({
          cli: {
            installationStatus: NOT_INSTALLED,
            authenticationStatus: UNKNOWN
          },
          agents: [],
          connectionChoices: []
        }),
        prepareInstallCliCommand: sinon.stub().resolves({
          executable: 'sonar',
          arguments: ['install'],
          interactive: true
        })
      } as never,
      onChange
    );

    await session.run('install');

    expect(refreshedWhileInProgress).to.be.true;
    expect(onChange.calledOnce).to.be.true;
    expect(onChange.firstCall.args).to.deep.equal([]);
    expect(createTerminal.calledOnce).to.be.true;
    expect(session.operationInProgress).to.be.true;
  });

  test('reports the finished state when setup ends before a terminal opens', async () => {
    const reports: Array<boolean | undefined> = [];
    const onChange = sinon.stub().callsFake((report?: boolean) => {
      reports.push(report);
      return Promise.resolve();
    });
    const onFinished = sinon.stub().resolves();
    const session = new CliSetupSession(
      { subscriptions: [] } as unknown as vscode.ExtensionContext,
      {
        getAiIntegrationState: sinon.stub().resolves({
          cli: {
            installationStatus: INSTALLED,
            authenticationStatus: AUTHENTICATED
          },
          agents: [],
          connectionChoices: []
        })
      } as never,
      onChange,
      onFinished
    );

    await session.run('install');

    expect(reports).to.deep.equal([undefined, true]);
    expect(session.operationInProgress).to.be.false;
    expect(onFinished.calledOnce).to.be.true;
    expect(onFinished.firstCall.args[2]).to.deep.equal({ status: 'FAILED' });
  });

  test('records only the observable terminal exit as a notice', async () => {
    const onChange = sinon.stub().resolves();
    const session = new CliSetupSession(
      { subscriptions: [] } as unknown as vscode.ExtensionContext,
      {} as never,
      onChange
    );

    await session.handleTerminalClosed({ code: 0, reason: vscode.TerminalExitReason.Process });
    expect(session.notice?.outcome).to.equal('completed');
    await session.handleTerminalClosed({ code: 0, reason: vscode.TerminalExitReason.User });
    expect(session.notice?.outcome).to.equal('cancelled');
    await session.handleTerminalClosed(undefined);
    expect(session.notice?.outcome).to.equal('unknown');
    await session.handleTerminalClosed({ code: 1, reason: vscode.TerminalExitReason.Process });
    expect(session.notice?.outcome).to.equal('failed');
    expect(onChange.callCount).to.equal(4);
  });

  for (const step of ['install', 'integrate'] as const) {
    test(`disposal during ${step} command preparation prevents opening a terminal`, async () => {
      const command = deferred<AiIntegration.PrepareCliCommandResponse>();
      const preparing = deferred<void>();
      const prepareCommand = sinon.stub().callsFake(() => {
        preparing.resolve();
        return command.promise;
      });
      const createTerminal = sinon.stub(vscode.window, 'createTerminal');
      const onChange = sinon.stub().resolves();
      const onFinished = sinon.stub().resolves();
      const session = new CliSetupSession(
        { subscriptions: [] } as unknown as vscode.ExtensionContext,
        {
          getAiIntegrationState: sinon.stub().resolves({
            cli: {
              installationStatus: step === 'install' ? NOT_INSTALLED : INSTALLED,
              authenticationStatus: AUTHENTICATED
            },
            agents: [
              {
                agent: AiIntegration.AiAgent.CODEX,
                detectionSources: [AiIntegration.AiAgentDetectionSource.CLI],
                cliIntegrationSupported: true,
                standaloneMcpSupported: false
              }
            ],
            connectionChoices: []
          }),
          prepareInstallCliCommand: prepareCommand,
          prepareIntegrateCliCommand: prepareCommand
        } as never,
        onChange,
        onFinished
      );

      const attempt = session.run(step, AiIntegration.AiAgent.CODEX);
      await preparing.promise;
      session.dispose();
      command.resolve({ executable: 'sonar', arguments: [step], interactive: true });
      await attempt;

      expect(createTerminal.notCalled).to.be.true;
      expect(onFinished.notCalled).to.be.true;
      expect(onChange.calledOnce).to.be.true;
      expect(session.operationInProgress).to.be.false;
    });
  }

  suite('CLI uninstall', () => {
    const status = AiIntegration.UninstallCliStatus;
    let session: CliSetupSession;
    let getState: sinon.SinonStub;
    let uninstall: sinon.SinonStub;
    let confirm: sinon.SinonStub;
    let progress: sinon.SinonStub;
    let onChange: sinon.SinonStub;
    let onAccepted: sinon.SinonStub;
    let onFinished: sinon.SinonStub;
    let log: sinon.SinonStub;
    let cancellation: vscode.CancellationTokenSource;

    setup(() => {
      sinon.stub(vscode.env, 'remoteName').value(undefined);
      getState = sinon.stub().resolves({
        cli: { installationStatus: INSTALLED, authenticationStatus: AUTHENTICATED, uninstallAvailable: true },
        agents: [],
        connectionChoices: []
      });
      uninstall = sinon.stub().resolves({ status: status.UNINSTALLED, stdout: '', stderr: '' });
      confirm = sinon.stub(vscode.window, 'showWarningMessage').resolves('Uninstall' as never);
      cancellation = new vscode.CancellationTokenSource();
      progress = sinon.stub(vscode.window, 'withProgress')
        .callsFake((_options, task) => task({ report: sinon.stub() }, cancellation.token));
      onChange = sinon.stub().resolves();
      onAccepted = sinon.stub();
      onFinished = sinon.stub();
      log = sinon.stub(logging, 'logToSonarLintOutput');
      session = new CliSetupSession(
        { subscriptions: [] } as unknown as vscode.ExtensionContext,
        { getAiIntegrationState: getState, uninstallCli: uninstall } as never,
        onChange
      );
    });

    teardown(() => {
      session.dispose();
      cancellation.dispose();
    });

    function attemptUninstall(): Promise<void> {
      return session.uninstall(onAccepted, onFinished);
    }

    function expectOutcome(expected: AiIntegration.AiIntegrationActionStatus): void {
      expect(onAccepted.calledOnce).to.be.true;
      expect(onFinished.calledOnceWithExactly({ status: expected })).to.be.true;
      expect(onAccepted.calledBefore(getState)).to.be.true;
      expect(onFinished.calledBefore(onChange.lastCall)).to.be.true;
    }

    test('forwards the no-argument request and matches backend outcome ordinals', async () => {
      const sendRequest = sinon.stub().resolves();
      await SonarLintExtendedLanguageClient.prototype.uninstallCli.call({ sendRequest });

      expect(sendRequest.calledOnceWithExactly(AiIntegration.UninstallCli.type)).to.be.true;
      expect([status.UNINSTALLED, status.NOT_AVAILABLE, status.FAILED]).to.deep.equal([0, 1, 2]);
    });

    test('confirmation cancellation makes no changes and releases the shared setup lock', async () => {
      const selection = deferred<string | undefined>();
      const prompted = deferred<void>();
      confirm.callsFake(() => { prompted.resolve(); return selection.promise; });
      const attempt = attemptUninstall();
      expect(session.operationInProgress).to.be.true;
      await prompted.promise;
      await session.run('install');
      await attemptUninstall();
      expect(getState.calledOnce).to.be.true;
      expect(confirm.calledOnce).to.be.true;
      selection.resolve(undefined);
      await attempt;

      expectOutcome(AiIntegration.AiIntegrationActionStatus.CANCELLED);
      expect(uninstall.notCalled).to.be.true;
      expect(progress.notCalled).to.be.true;
      expect(session.operationInProgress).to.be.false;
      expect(session.notice).to.be.undefined;
      expect(onChange.getCalls().map(call => call.args)).to.deep.equal([[], [true]]);
      expect(confirm.firstCall.args[1]).to.include({ modal: true });
      expect(confirm.firstCall.args[1].detail).to.include('terminals, IDEs, and agents')
        .and.include('credentials and registered integrations').and.include('may revoke recorded server tokens');
    });

    test('uses noncancellable progress and blocks setup until the request finishes', async () => {
      const response = deferred<AiIntegration.UninstallCliResponse>();
      const started = deferred<void>();
      uninstall.callsFake(() => { started.resolve(); return response.promise; });
      const attempt = attemptUninstall();
      await started.promise;
      await session.run('authenticate');
      await attemptUninstall();

      expect(getState.calledOnce).to.be.true;
      expect(uninstall.calledOnce).to.be.true;
      expect(session.operationInProgress).to.be.true;
      expect(progress.firstCall.args[0]).to.deep.equal({
        location: vscode.ProgressLocation.Notification, title: 'Uninstalling SonarQube CLI', cancellable: false
      });
      response.resolve({ status: status.UNINSTALLED, stdout: 'Reset completed', stderr: 'Cleanup warning', message: 'Remove PATH' });
      await attempt;

      expectOutcome(AiIntegration.AiIntegrationActionStatus.SUCCEEDED);
      expect(log.getCalls().map(call => call.args[0])).to.deep.equal(['Reset completed', 'Cleanup warning', 'Remove PATH']);
      expect(session.notice).to.include({ outcome: 'completed', showOutput: true });
      expect(session.notice.message).to.include('PATH entry manually').and.include('Some configuration may remain');
      expect(session.operationInProgress).to.be.false;
      expect(onChange.lastCall.args).to.deep.equal([true]);
    });

    for (const result of [status.NOT_AVAILABLE, status.FAILED]) {
      test(`shows outcome ${result} with all reset output available and refreshes`, async () => {
        uninstall.resolves({ status: result, stdout: 'Partial reset', stderr: 'Reset error', message: 'Backend diagnostic' });
        await attemptUninstall();

        expectOutcome(AiIntegration.AiIntegrationActionStatus.FAILED);
        expect(session.notice).to.deep.equal({ outcome: 'failed', message: 'Backend diagnostic', showOutput: true });
        expect(log.getCalls().map(call => call.args[0])).to.deep.equal(['Partial reset', 'Reset error', 'Backend diagnostic']);
        expect(onChange.lastCall.args).to.deep.equal([true]);
        expect(session.operationInProgress).to.be.false;
      });
    }

    test('reports transport failures and refreshes the state', async () => {
      uninstall.rejects(new Error('connection lost'));
      await attemptUninstall();

      expectOutcome(AiIntegration.AiIntegrationActionStatus.FAILED);
      expect(session.notice).to.include({ outcome: 'failed', showOutput: true });
      expect(log.calledOnceWithExactly('Could not uninstall SonarQube CLI: connection lost')).to.be.true;
      expect(onChange.lastCall.args).to.deep.equal([true]);
      expect(session.operationInProgress).to.be.false;
    });

    test('rejects remote and unsupported installations before prompting', async () => {
      sinon.stub(vscode.env, 'remoteName').value('ssh-remote');
      await attemptUninstall();
      expect(getState.notCalled).to.be.true;
      expect(onAccepted.notCalled).to.be.true;
      expect(onFinished.notCalled).to.be.true;
      sinon.stub(vscode.env, 'remoteName').value(undefined);
      getState.resolves({ cli: { installationStatus: INSTALLED, authenticationStatus: AUTHENTICATED } });
      await attemptUninstall();

      expectOutcome(AiIntegration.AiIntegrationActionStatus.FAILED);
      expect(confirm.notCalled).to.be.true;
      expect(uninstall.notCalled).to.be.true;
      expect(session.operationInProgress).to.be.false;
    });

    test('does not uninstall or update the view after disposal during confirmation', async () => {
      const selection = deferred<string>();
      const prompted = deferred<void>();
      confirm.callsFake(() => { prompted.resolve(); return selection.promise; });
      const attempt = attemptUninstall();
      await prompted.promise;
      session.dispose();
      selection.resolve('Uninstall');
      await attempt;

      expect(uninstall.notCalled).to.be.true;
      expect(progress.notCalled).to.be.true;
      expect(onChange.calledOnce).to.be.true;
      expect(onAccepted.calledOnce).to.be.true;
      expect(onFinished.calledOnceWithExactly({ status: AiIntegration.AiIntegrationActionStatus.CANCELLED })).to.be.true;
    });

    test('reports cancellation when disposed before the progress task starts', async () => {
      progress.callsFake((_options, task) => {
        session.dispose();
        return task({ report: sinon.stub() }, cancellation.token);
      });

      await attemptUninstall();

      expect(uninstall.notCalled).to.be.true;
      expect(onFinished.calledOnceWithExactly({ status: AiIntegration.AiIntegrationActionStatus.CANCELLED })).to.be.true;
      expect(session.operationInProgress).to.be.false;
    });

    for (const [result, expected] of [
      [status.UNINSTALLED, AiIntegration.AiIntegrationActionStatus.SUCCEEDED],
      [status.FAILED, AiIntegration.AiIntegrationActionStatus.FAILED],
      [99 as AiIntegration.UninstallCliStatus, AiIntegration.AiIntegrationActionStatus.UNKNOWN]
    ] as const) {
      test(`retains observed outcome ${result} after disposal without updating the view`, async () => {
        const response = deferred<AiIntegration.UninstallCliResponse>();
        const started = deferred<void>();
        uninstall.callsFake(() => { started.resolve(); return response.promise; });
        const attempt = attemptUninstall();
        await started.promise;
        session.dispose();
        response.resolve({ status: result, stdout: 'Reset output', stderr: 'Cleanup warning' });
        await attempt;

        expect(log.getCalls().map(call => call.args[0])).to.deep.equal(['Reset output', 'Cleanup warning']);
        expect(onChange.calledOnce).to.be.true;
        expect(session.notice).to.be.undefined;
        expect(onAccepted.calledOnce).to.be.true;
        expect(onFinished.calledOnceWithExactly({ status: expected })).to.be.true;
      });
    }

    test('rejects an already disposed session without reporting an attempt', async () => {
      session.dispose();

      await attemptUninstall();

      expect(onAccepted.notCalled).to.be.true;
      expect(onFinished.notCalled).to.be.true;
      expect(getState.notCalled).to.be.true;
      expect(onChange.notCalled).to.be.true;
    });

    test('reports a declined confirmation as cancelled', async () => {
      confirm.resolves('Keep CLI' as never);

      await attemptUninstall();

      expectOutcome(AiIntegration.AiIntegrationActionStatus.CANCELLED);
      expect(uninstall.notCalled).to.be.true;
    });

    for (const operation of ['preflight', 'confirmation']) {
      test(`reports ${operation} errors as failed and releases the setup lock`, async () => {
        (operation === 'preflight' ? getState : confirm).rejects(new Error('request failed'));

        await attemptUninstall();

        expectOutcome(AiIntegration.AiIntegrationActionStatus.FAILED);
        expect(uninstall.notCalled).to.be.true;
        expect(session.operationInProgress).to.be.false;
      });

      test(`reports a rejected ${operation} after disposal as cancellation before the uninstall RPC`, async () => {
        const pending = deferred<never>();
        const started = deferred<void>();
        (operation === 'preflight' ? getState : confirm).callsFake(() => {
          started.resolve();
          return pending.promise;
        });
        const attempt = attemptUninstall();
        await started.promise;
        session.dispose();
        pending.reject(new Error('view disposed'));
        await attempt;

        expect(onAccepted.calledOnce).to.be.true;
        expect(onFinished.calledOnceWithExactly({ status: AiIntegration.AiIntegrationActionStatus.CANCELLED })).to.be.true;
        expect(uninstall.notCalled).to.be.true;
        expect(progress.notCalled).to.be.true;
        expect(onChange.calledOnce).to.be.true;
        expect(session.notice).to.be.undefined;
        expect(session.operationInProgress).to.be.false;
      });
    }

    test('preserves a rejected running uninstall RPC as failed after disposal', async () => {
      const pending = deferred<AiIntegration.UninstallCliResponse>();
      const started = deferred<void>();
      uninstall.callsFake(() => {
        started.resolve();
        return pending.promise;
      });
      const attempt = attemptUninstall();
      await started.promise;
      session.dispose();
      pending.reject(new Error('uninstall request failed'));
      await attempt;

      expect(onAccepted.calledOnce).to.be.true;
      expect(onFinished.calledOnceWithExactly({ status: AiIntegration.AiIntegrationActionStatus.FAILED })).to.be.true;
      expect(uninstall.calledOnce).to.be.true;
      expect(progress.calledOnce).to.be.true;
      expect(onChange.calledOnce).to.be.true;
      expect(session.notice).to.be.undefined;
      expect(session.operationInProgress).to.be.false;
      expect(log.calledOnceWithExactly('Could not uninstall SonarQube CLI: uninstall request failed')).to.be.true;
    });

    test('reports an indeterminate backend response independently of the notice', async () => {
      uninstall.resolves({ status: 99, stdout: '', stderr: '', message: 'Backend diagnostic' });

      await attemptUninstall();

      expectOutcome(AiIntegration.AiIntegrationActionStatus.UNKNOWN);
      expect(session.notice).to.include({ outcome: 'failed', message: 'Backend diagnostic' });
    });

    test('reports success once before a failed refresh and releases the setup lock', async () => {
      const failure = new Error('refresh failed');
      onChange.onSecondCall().rejects(failure);

      try {
        await attemptUninstall();
        expect.fail('refresh should fail');
      } catch (error) {
        expect(error).to.equal(failure);
      }

      expectOutcome(AiIntegration.AiIntegrationActionStatus.SUCCEEDED);
      expect(session.operationInProgress).to.be.false;
    });

    test('reporting failures do not interrupt uninstall, completion or lock release', async () => {
      onAccepted.rejects(new Error('start notification failed'));
      onFinished.rejects(new Error('completion notification failed'));

      await attemptUninstall();

      expectOutcome(AiIntegration.AiIntegrationActionStatus.SUCCEEDED);
      expect(uninstall.calledOnce).to.be.true;
      expect(session.operationInProgress).to.be.false;
      expect(session.notice.outcome).to.equal('completed');
    });
  });

  suite('saved connection authentication', () => {
    const status = AiIntegration.AuthenticateCliWithConnectionStatus;
    let session: CliSetupSession;
    let client: {
      getAiIntegrationState: sinon.SinonStub;
      authenticateCliWithConnection: sinon.SinonStub;
      prepareAuthenticateCliCommand: sinon.SinonStub;
    };
    let onChange: sinon.SinonStub;
    let onFinished: sinon.SinonStub;
    let createTerminal: sinon.SinonStub;
    let progressCancellation: vscode.CancellationTokenSource;
    let requestStarted: ReturnType<typeof deferred<void>>;
    let sendRequest: sinon.SinonStub;

    setup(() => {
      progressCancellation = new vscode.CancellationTokenSource();
      sinon
        .stub(vscode.window, 'withProgress')
        .callsFake((_options, task) => task({ report: sinon.stub() }, progressCancellation.token));
      createTerminal = sinon.stub(vscode.window, 'createTerminal').returns({ show: sinon.stub() } as never);
      sinon.stub(vscode.window, 'onDidCloseTerminal').returns({ dispose: sinon.stub() });
      requestStarted = deferred<void>();
      sendRequest = sinon.stub().callsFake(() => {
        requestStarted.resolve();
        return Promise.resolve({ status: status.AUTHENTICATED });
      });
      client = {
        getAiIntegrationState: sinon.stub().resolves({
          cli: { installationStatus: INSTALLED, authenticationStatus: UNAUTHENTICATED },
          agents: [],
          connectionChoices: [{ connectionId: 'cloud', serverUrl: 'https://sonarcloud.io', organization: 'example' }]
        }),
        authenticateCliWithConnection: sinon
          .stub()
          .callsFake((params, token) =>
            SonarLintExtendedLanguageClient.prototype.authenticateCliWithConnection.call({ sendRequest }, params, token)
          ),
        prepareAuthenticateCliCommand: sinon.stub().resolves({
          executable: 'sonar',
          arguments: ['auth', 'login'],
          interactive: true
        })
      };
      onChange = sinon.stub().resolves();
      onFinished = sinon.stub().resolves();
      session = new CliSetupSession(
        { subscriptions: [] } as unknown as vscode.ExtensionContext,
        client as never,
        onChange,
        onFinished
      );
    });

    teardown(() => {
      session.dispose();
      progressCancellation.dispose();
    });

    test('forwards only the connection ID and cancellation token through the client', async () => {
      const params = { connectionId: 'cloud' };
      await SonarLintExtendedLanguageClient.prototype.authenticateCliWithConnection.call(
        { sendRequest },
        params,
        progressCancellation.token
      );
      expect(
        sendRequest.calledOnceWithExactly(
          AiIntegration.AuthenticateCliWithConnection.type,
          params,
          progressCancellation.token
        )
      ).to.be.true;
      expect([
        status.AUTHENTICATED,
        status.INTERACTIVE_LOGIN_REQUIRED,
        status.UPGRADE_REQUIRED,
        status.FAILED
      ]).to.deep.equal([0, 1, 2, 3]);
    });

    test('completes saved-token authentication and refreshes exactly once without a terminal', async () => {
      await session.run('authenticate');
      expect(client.authenticateCliWithConnection.calledOnce).to.be.true;
      expect(client.authenticateCliWithConnection.firstCall.args[0]).to.deep.equal({ connectionId: 'cloud' });
      expect(client.prepareAuthenticateCliCommand.notCalled).to.be.true;
      expect(createTerminal.notCalled).to.be.true;
      expect(onFinished.calledOnce).to.be.true;
      expect(onFinished.firstCall.args).to.deep.equal(['authenticate', undefined, { status: 'SUCCEEDED' }]);
      expect(onChange.getCalls().map(call => call.args)).to.deep.equal([[], [true]]);
      expect(session.notice?.outcome).to.equal('completed');
      expect(session.operationInProgress).to.be.false;
    });

    test('uses interactive login only when the saved credentials require it', async () => {
      client.authenticateCliWithConnection.resolves({ status: status.INTERACTIVE_LOGIN_REQUIRED });
      await session.run('authenticate');
      expect(
        client.prepareAuthenticateCliCommand.calledOnceWithExactly({
          serverUrl: 'https://sonarcloud.io',
          organization: 'example'
        })
      ).to.be.true;
      expect(createTerminal.calledOnce).to.be.true;
      expect(onFinished.notCalled).to.be.true;
      await session.handleTerminalClosed({ code: 0, reason: vscode.TerminalExitReason.Process });
      expect(onFinished.calledOnce).to.be.true;
    });

    test('uses interactive login when an older server does not support saved-token authentication', async () => {
      sendRequest.rejects(new ResponseError(ErrorCodes.MethodNotFound, 'Unknown method'));
      await session.run('authenticate');
      expect(
        client.prepareAuthenticateCliCommand.calledOnceWithExactly({
          serverUrl: 'https://sonarcloud.io',
          organization: 'example'
        })
      ).to.be.true;
      expect(createTerminal.calledOnce).to.be.true;
      expect(onFinished.notCalled).to.be.true;
    });

    test('does not start interactive login for other RPC errors', async () => {
      sendRequest.rejects(new ResponseError(ErrorCodes.InternalError, 'Request failed'));
      await session.run('authenticate');
      expect(client.prepareAuthenticateCliCommand.notCalled).to.be.true;
      expect(createTerminal.notCalled).to.be.true;
      expect(onFinished.firstCall.args[2]).to.deep.equal({ status: 'FAILED' });
      expect(session.operationInProgress).to.be.false;
    });

    test('keeps interactive login when there is no saved connection', async () => {
      client.getAiIntegrationState.resolves({
        cli: { installationStatus: INSTALLED, authenticationStatus: UNAUTHENTICATED },
        agents: [],
        connectionChoices: []
      });
      await session.run('authenticate');
      expect(client.authenticateCliWithConnection.notCalled).to.be.true;
      expect(client.prepareAuthenticateCliCommand.calledOnceWithExactly({})).to.be.true;
      expect(createTerminal.calledOnce).to.be.true;
    });

    for (const response of [
      { status: status.UPGRADE_REQUIRED, message: 'Update SonarQube CLI to the latest version.' },
      { status: status.UPGRADE_REQUIRED },
      { status: status.FAILED, message: 'The saved token was rejected.' },
      { status: status.FAILED }
    ]) {
      test(`shows ${status[response.status]} without interactive login (${response.message ?? 'no message'})`, async () => {
        client.authenticateCliWithConnection.resolves(response);
        await session.run('authenticate');
        expect(session.notice).to.deep.equal({
          outcome: 'failed',
          message:
            response.message ??
            (response.status === status.UPGRADE_REQUIRED
              ? 'Update SonarQube CLI to the latest version to reuse a saved connection token.'
              : 'Could not authenticate SonarQube CLI. Try again.')
        });
        expect(client.prepareAuthenticateCliCommand.notCalled).to.be.true;
        expect(createTerminal.notCalled).to.be.true;
        expect(onFinished.firstCall.args[2]).to.deep.equal({ status: 'FAILED' });
        expect(session.operationInProgress).to.be.false;
      });
    }

    test('releases the operation after a failed request and allows a retry', async () => {
      client.authenticateCliWithConnection.rejects(new Error('Transport failure'));
      await session.run('authenticate');
      expect(session.notice?.outcome).to.equal('failed');
      expect(session.operationInProgress).to.be.false;
      client.authenticateCliWithConnection.resolves({ status: status.AUTHENTICATED });
      await session.run('authenticate');
      expect(onFinished.callCount).to.equal(2);
      expect(createTerminal.notCalled).to.be.true;
    });

    for (const result of [status.AUTHENTICATED, status.INTERACTIVE_LOGIN_REQUIRED]) {
      test(`cancels the RPC and ignores a late ${status[result]} result`, async () => {
        const response = deferred<AiIntegration.AuthenticateCliWithConnectionResponse>();
        client.authenticateCliWithConnection.callsFake(() => {
          requestStarted.resolve();
          return response.promise;
        });
        const attempt = session.run('authenticate');
        await requestStarted.promise;
        progressCancellation.cancel();
        expect(client.authenticateCliWithConnection.firstCall.args[1].isCancellationRequested).to.be.true;
        response.resolve({ status: result });
        await attempt;
        expect(onFinished.firstCall.args[2]).to.deep.equal({ status: 'CANCELLED' });
        expect(session.notice?.outcome).to.equal('cancelled');
        expect(client.prepareAuthenticateCliCommand.notCalled).to.be.true;
        expect(createTerminal.notCalled).to.be.true;
        expect(session.operationInProgress).to.be.false;
      });
    }

    test('reports a rejected cancelled request as cancellation', async () => {
      client.authenticateCliWithConnection.callsFake((_params, token: vscode.CancellationToken) => {
        requestStarted.resolve();
        return new Promise((_resolve, reject) => token.onCancellationRequested(() => reject(new Error('Cancelled'))));
      });
      const attempt = session.run('authenticate');
      await requestStarted.promise;
      progressCancellation.cancel();
      await attempt;
      expect(onFinished.firstCall.args[2]).to.deep.equal({ status: 'CANCELLED' });
      expect(session.operationInProgress).to.be.false;
    });

    for (const dispose of [false, true]) {
      test(`ignores a late MethodNotFound after ${dispose ? 'disposal' : 'cancellation'}`, async () => {
        const response = deferred<AiIntegration.AuthenticateCliWithConnectionResponse>();
        sendRequest.callsFake(() => {
          requestStarted.resolve();
          return response.promise;
        });
        const attempt = session.run('authenticate');
        await requestStarted.promise;
        if (dispose) {
          session.dispose();
        } else {
          progressCancellation.cancel();
        }
        response.reject(new ResponseError(ErrorCodes.MethodNotFound, 'Unknown method'));
        await attempt;
        expect(client.prepareAuthenticateCliCommand.notCalled).to.be.true;
        expect(createTerminal.notCalled).to.be.true;
        expect(session.operationInProgress).to.be.false;
        if (dispose) {
          expect(onFinished.notCalled).to.be.true;
          expect(onChange.calledOnce).to.be.true;
        } else {
          expect(onFinished.firstCall.args[2]).to.deep.equal({ status: 'CANCELLED' });
        }
      });
    }

    test('disposal cancels the request without late completion or refresh', async () => {
      const response = deferred<AiIntegration.AuthenticateCliWithConnectionResponse>();
      client.authenticateCliWithConnection.callsFake(() => {
        requestStarted.resolve();
        return response.promise;
      });
      const attempt = session.run('authenticate');
      await requestStarted.promise;
      session.dispose();
      expect(client.authenticateCliWithConnection.firstCall.args[1].isCancellationRequested).to.be.true;
      response.resolve({ status: status.AUTHENTICATED });
      await attempt;
      expect(onFinished.notCalled).to.be.true;
      expect(onChange.calledOnce).to.be.true;
      expect(session.notice).to.be.undefined;
      expect(session.operationInProgress).to.be.false;
    });

    test('disposal during command preparation prevents opening the fallback terminal', async () => {
      const command = deferred<AiIntegration.PrepareCliCommandResponse>();
      const preparing = deferred<void>();
      client.authenticateCliWithConnection.resolves({ status: status.INTERACTIVE_LOGIN_REQUIRED });
      client.prepareAuthenticateCliCommand.callsFake(() => {
        preparing.resolve();
        return command.promise;
      });
      const attempt = session.run('authenticate');
      await preparing.promise;
      session.dispose();
      command.resolve({ executable: 'sonar', arguments: ['auth', 'login'], interactive: true });
      await attempt;
      expect(createTerminal.notCalled).to.be.true;
      expect(onFinished.notCalled).to.be.true;
      expect(onChange.calledOnce).to.be.true;
    });

    test('ignores repeated clicks while token authentication is pending', async () => {
      const response = deferred<AiIntegration.AuthenticateCliWithConnectionResponse>();
      client.authenticateCliWithConnection.callsFake(() => {
        requestStarted.resolve();
        return response.promise;
      });
      const attempt = session.run('authenticate');
      await requestStarted.promise;
      await session.run('authenticate');
      expect(client.authenticateCliWithConnection.calledOnce).to.be.true;
      response.resolve({ status: status.AUTHENTICATED });
      await attempt;
      expect(onFinished.calledOnce).to.be.true;
    });
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
