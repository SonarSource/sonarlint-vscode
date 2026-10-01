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
import {
  canIntegrateAgent,
  CliSetupSession,
  resolveCliPrimaryAction,
  selectConnection
} from '../../../src/aiAgentsConfiguration/cliSetup';
import { AiIntegration } from '../../../src/lsp/aiIntegrationProtocol';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';
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

    setup(() => {
      progressCancellation = new vscode.CancellationTokenSource();
      sinon
        .stub(vscode.window, 'withProgress')
        .callsFake((_options, task) => task({ report: sinon.stub() }, progressCancellation.token));
      createTerminal = sinon.stub(vscode.window, 'createTerminal').returns({ show: sinon.stub() } as never);
      sinon.stub(vscode.window, 'onDidCloseTerminal').returns({ dispose: sinon.stub() });
      requestStarted = deferred<void>();
      client = {
        getAiIntegrationState: sinon.stub().resolves({
          cli: { installationStatus: INSTALLED, authenticationStatus: UNAUTHENTICATED },
          agents: [],
          connectionChoices: [{ connectionId: 'cloud', serverUrl: 'https://sonarcloud.io', organization: 'example' }]
        }),
        authenticateCliWithConnection: sinon.stub().callsFake(() => {
          requestStarted.resolve();
          return Promise.resolve({ status: status.AUTHENTICATED });
        }),
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
      const sendRequest = sinon.stub().resolves({ status: status.AUTHENTICATED });
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
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
