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
        cli: { installationStatus: INSTALLED, authenticationStatus: UNAUTHENTICATED, vortexAvailable: false },
        agents: [],
        connectionChoices: [cloud, server],
        recommendedConnectionId: 'cloud'
      })
    ).to.deep.equal({ kind: 'connection', connection: cloud });

    expect(
      await selectConnection({
        cli: { installationStatus: INSTALLED, authenticationStatus: UNAUTHENTICATED, vortexAvailable: false },
        agents: [],
        connectionChoices: [server]
      })
    ).to.deep.equal({ kind: 'connection', connection: server });

    expect(
      await selectConnection({
        cli: { installationStatus: INSTALLED, authenticationStatus: UNAUTHENTICATED, vortexAvailable: false },
        agents: [],
        connectionChoices: []
      })
    ).to.deep.equal({ kind: 'none' });
  });

  test('reports a cancelled connection pick when the user dismisses Quick Pick', async () => {
    sinon.stub(vscode.window, 'showQuickPick').resolves(undefined);

    expect(
      await selectConnection({
        cli: { installationStatus: INSTALLED, authenticationStatus: UNAUTHENTICATED, vortexAvailable: false },
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
            authenticationStatus: UNKNOWN,
            vortexAvailable: false
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
            authenticationStatus: AUTHENTICATED,
            vortexAvailable: false
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
    expect(onFinished.firstCall.args[2]).to.deep.equal({
      status: 'FAILED',
      failureCategory: 'UNSUPPORTED'
    });
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
});
