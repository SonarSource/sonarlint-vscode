/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as os from 'node:os';
import * as vscode from 'vscode';
import { AiIntegration } from '../lsp/aiIntegrationProtocol';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { getAiIntegrationStateParams, getDetectedIntegrationAgents } from './aiAgentUtils';
import type { AiIntegrationOutcome } from './aiIntegrationTelemetry';

export type CliSetupStep = 'install' | 'authenticate' | 'integrate';
export type SetupOutcome = 'completed' | 'cancelled' | 'failed' | 'unknown';
export type CliPrimaryCommand = 'installCli' | 'authenticateCli' | 'openCliDocumentation' | 'refresh';

export interface CliPrimaryAction {
  command: CliPrimaryCommand;
  label: string;
}

export interface CliSetupNotice {
  outcome: SetupOutcome;
  message: string;
}

export type ConnectionPick =
  | { kind: 'connection'; connection: AiIntegration.AiIntegrationConnection }
  | { kind: 'none' }
  | { kind: 'cancelled' };

const SETUP_START_FAILED = 'Could not start SonarQube CLI setup. Try again.';
const LOGIN_CANCELLED = 'SonarQube CLI login was cancelled.';
const LOGIN_NOT_INTERACTIVE = 'SonarQube CLI login must run interactively. Refresh and try again.';
const INTEGRATE_NOT_INTERACTIVE = 'Agent integration must run interactively. Refresh and try again.';
const TERMINAL_CANCELLED = 'SonarQube CLI setup was cancelled.';
const TERMINAL_COMPLETED = 'The CLI command finished. Setup state has been refreshed.';
const TERMINAL_UNKNOWN = 'The terminal closed without a reliable result. Refresh to check setup state.';
const TERMINAL_FAILED = 'The CLI command failed. Review the terminal output and try again.';
const LABEL_INSTALL_GUIDE = 'View installation guide';
const LABEL_INSTALL = 'Install SonarQube CLI';
const LABEL_TROUBLESHOOT = 'Open troubleshooting guide';
const LABEL_SIGN_IN = 'Sign in with SonarQube CLI';
const LABEL_REFRESH = 'Refresh';
const PLACEHOLDER_CONNECTION = 'Choose a SonarQube connection for CLI login';

export function resolveCliPrimaryAction(
  installationStatus: AiIntegration.CliInstallationStatus,
  authenticationStatus: AiIntegration.CliAuthenticationStatus,
  isRemote: boolean
): CliPrimaryAction | undefined {
  if (isRemote) {
    return { command: 'openCliDocumentation', label: LABEL_INSTALL_GUIDE };
  }
  switch (installationStatus) {
    case AiIntegration.CliInstallationStatus.NOT_INSTALLED:
      return { command: 'installCli', label: LABEL_INSTALL };
    case AiIntegration.CliInstallationStatus.UNUSABLE:
      return { command: 'openCliDocumentation', label: LABEL_TROUBLESHOOT };
    case AiIntegration.CliInstallationStatus.INSTALLED:
      return resolveInstalledPrimaryAction(authenticationStatus);
    default: {
      const exhaustive: never = installationStatus;
      return exhaustive;
    }
  }
}

export function canIntegrateAgent(
  installationStatus: AiIntegration.CliInstallationStatus,
  authenticationStatus: AiIntegration.CliAuthenticationStatus,
  isRemote: boolean,
  operationInProgress: boolean
): boolean {
  return !operationInProgress && isAgentIntegrationAllowed(installationStatus, authenticationStatus, isRemote);
}

export async function selectConnection(state: AiIntegration.GetAiIntegrationStateResponse): Promise<ConnectionPick> {
  if (state.recommendedConnectionId) {
    const recommended = state.connectionChoices.find(
      connection => connection.connectionId === state.recommendedConnectionId
    );
    if (recommended) {
      return { kind: 'connection', connection: recommended };
    }
  }
  if (state.connectionChoices.length === 0) {
    return { kind: 'none' };
  }
  if (state.connectionChoices.length === 1) {
    return { kind: 'connection', connection: state.connectionChoices[0] };
  }
  const selection = await vscode.window.showQuickPick(
    state.connectionChoices.map(connection => ({
      label: connection.organization ?? connection.serverUrl,
      description: connection.organization ? connection.serverUrl : undefined,
      connection
    })),
    { placeHolder: PLACEHOLDER_CONNECTION }
  );
  return selection ? { kind: 'connection', connection: selection.connection } : { kind: 'cancelled' };
}

export class CliSetupSession {
  private activeSetupTerminal?: vscode.Terminal;
  private terminalCloseListener?: vscode.Disposable;
  private inProgress = false;
  private activeStep?: CliSetupStep;
  private activeAgent?: AiIntegration.AiAgent;
  private pendingOutcome?: AiIntegrationOutcome;
  notice?: CliSetupNotice;

  constructor(
    private readonly extensionContext: vscode.ExtensionContext,
    private readonly languageClient: SonarLintExtendedLanguageClient,
    private readonly onChange: (report?: boolean) => Thenable<void>,
    private readonly onFinished?: (
      step: CliSetupStep,
      agent: AiIntegration.AiAgent | undefined,
      outcome: AiIntegrationOutcome
    ) => Thenable<void> | Promise<void>
  ) {}

  get operationInProgress(): boolean {
    return this.inProgress;
  }

  async run(step: CliSetupStep, agentId?: AiIntegration.AiAgent): Promise<void> {
    if (this.inProgress) {
      this.activeSetupTerminal?.show();
      return;
    }

    this.inProgress = true;
    this.activeStep = step;
    this.activeAgent = agentId;
    this.pendingOutcome = undefined;
    this.notice = undefined;
    let terminalStarted = false;
    try {
      await this.onChange();
      terminalStarted = await this.execute(step, agentId);
    } catch {
      this.notice = { outcome: 'failed', message: SETUP_START_FAILED };
      this.pendingOutcome ??= { status: AiIntegration.AiIntegrationActionStatus.FAILED };
    } finally {
      if (!terminalStarted) {
        this.inProgress = false;
        try {
          await this.finish(this.pendingOutcome ?? { status: AiIntegration.AiIntegrationActionStatus.FAILED });
        } finally {
          await this.onChange(true);
        }
      }
    }
  }

  async handleTerminalClosed(exitStatus?: vscode.TerminalExitStatus): Promise<void> {
    this.notice = noticeForTerminalExit(exitStatus);
    let outcome: AiIntegrationOutcome;
    switch (this.notice.outcome) {
      case 'completed':
        outcome = { status: AiIntegration.AiIntegrationActionStatus.SUCCEEDED };
        break;
      case 'cancelled':
        outcome = { status: AiIntegration.AiIntegrationActionStatus.CANCELLED };
        break;
      case 'unknown':
        outcome = { status: AiIntegration.AiIntegrationActionStatus.UNKNOWN };
        break;
      case 'failed':
        outcome = { status: AiIntegration.AiIntegrationActionStatus.FAILED };
        break;
    }
    try {
      await this.finish(outcome);
    } finally {
      await this.onChange(true);
    }
  }

  private async finish(outcome: AiIntegrationOutcome): Promise<void> {
    const step = this.activeStep;
    const agent = this.activeAgent;
    this.activeStep = undefined;
    this.activeAgent = undefined;
    this.pendingOutcome = undefined;
    if (step !== undefined) {
      await this.onFinished?.(step, agent, outcome);
    }
  }

  private async execute(step: CliSetupStep, agentId?: AiIntegration.AiAgent): Promise<boolean> {
    const state = await this.languageClient.getAiIntegrationState(
      getAiIntegrationStateParams(AiIntegration.AiIntegrationScope.GLOBAL)
    );
    const isRemote = vscode.env.remoteName !== undefined;
    switch (step) {
      case 'install':
        return this.startInstall(state, isRemote);
      case 'authenticate':
        return this.startAuthenticate(state, isRemote);
      case 'integrate':
        return this.startIntegrate(state, isRemote, agentId);
      default: {
        const exhaustive: never = step;
        return exhaustive;
      }
    }
  }

  private async startInstall(state: AiIntegration.GetAiIntegrationStateResponse, isRemote: boolean): Promise<boolean> {
    if (isRemote || state.cli.installationStatus !== AiIntegration.CliInstallationStatus.NOT_INSTALLED) {
      this.pendingOutcome = { status: AiIntegration.AiIntegrationActionStatus.FAILED };
      return false;
    }
    return this.openSetupTerminal('SonarQube CLI installation', await this.languageClient.prepareInstallCliCommand());
  }

  private async startAuthenticate(
    state: AiIntegration.GetAiIntegrationStateResponse,
    isRemote: boolean
  ): Promise<boolean> {
    if (!canStartAuthenticationFlow(state, isRemote)) {
      this.pendingOutcome = { status: AiIntegration.AiIntegrationActionStatus.FAILED };
      return false;
    }
    const pick = await selectConnection(state);
    if (pick.kind === 'cancelled') {
      this.notice = { outcome: 'cancelled', message: LOGIN_CANCELLED };
      this.pendingOutcome = { status: AiIntegration.AiIntegrationActionStatus.CANCELLED };
      return false;
    }
    return this.openInteractiveCommand(
      'SonarQube CLI login',
      await this.languageClient.prepareAuthenticateCliCommand(authenticateParams(pick)),
      LOGIN_NOT_INTERACTIVE
    );
  }

  private async startIntegrate(
    state: AiIntegration.GetAiIntegrationStateResponse,
    isRemote: boolean,
    agentId?: AiIntegration.AiAgent
  ): Promise<boolean> {
    const agent = getDetectedIntegrationAgents(state).find(
      detected => detected.agent === agentId && detected.cliIntegrationSupported
    );
    if (!isAgentIntegrationAllowed(state.cli.installationStatus, state.cli.authenticationStatus, isRemote) || !agent) {
      this.pendingOutcome = { status: AiIntegration.AiIntegrationActionStatus.FAILED };
      return false;
    }
    return this.openInteractiveCommand(
      `SonarQube CLI · ${agent.name}`,
      await this.languageClient.prepareIntegrateCliCommand({ agent: agent.agent }),
      INTEGRATE_NOT_INTERACTIVE
    );
  }

  private openInteractiveCommand(
    name: string,
    command: AiIntegration.PrepareCliCommandResponse,
    nonInteractiveMessage: string
  ): boolean {
    if (!command.interactive) {
      this.notice = { outcome: 'failed', message: nonInteractiveMessage };
      this.pendingOutcome = { status: AiIntegration.AiIntegrationActionStatus.FAILED };
      return false;
    }
    return this.openSetupTerminal(name, command);
  }

  private openSetupTerminal(name: string, command: AiIntegration.PrepareCliCommandResponse): boolean {
    try {
      const terminal = vscode.window.createTerminal({
        name,
        shellPath: command.executable,
        shellArgs: command.arguments,
        cwd: os.homedir()
      });
      this.activeSetupTerminal = terminal;
      this.ensureTerminalCloseListener();
      terminal.show();
      return true;
    } catch {
      this.pendingOutcome = { status: AiIntegration.AiIntegrationActionStatus.FAILED };
      return false;
    }
  }

  private ensureTerminalCloseListener(): void {
    if (this.terminalCloseListener) {
      return;
    }
    this.terminalCloseListener = vscode.window.onDidCloseTerminal(closedTerminal => {
      if (closedTerminal !== this.activeSetupTerminal) {
        return;
      }
      this.activeSetupTerminal = undefined;
      this.inProgress = false;
      void this.handleTerminalClosed(closedTerminal.exitStatus);
    });
    this.extensionContext.subscriptions.push(this.terminalCloseListener);
  }
}

function resolveInstalledPrimaryAction(
  authenticationStatus: AiIntegration.CliAuthenticationStatus
): CliPrimaryAction | undefined {
  switch (authenticationStatus) {
    case AiIntegration.CliAuthenticationStatus.AUTHENTICATED:
      return undefined;
    case AiIntegration.CliAuthenticationStatus.UNAUTHENTICATED:
    case AiIntegration.CliAuthenticationStatus.INVALID:
    case AiIntegration.CliAuthenticationStatus.UNVERIFIED:
      return { command: 'authenticateCli', label: LABEL_SIGN_IN };
    case AiIntegration.CliAuthenticationStatus.UNAVAILABLE:
    case AiIntegration.CliAuthenticationStatus.UNKNOWN:
      return { command: 'refresh', label: LABEL_REFRESH };
    default: {
      const exhaustive: never = authenticationStatus;
      return exhaustive;
    }
  }
}

function canStartAuthentication(authenticationStatus: AiIntegration.CliAuthenticationStatus): boolean {
  switch (authenticationStatus) {
    case AiIntegration.CliAuthenticationStatus.UNAUTHENTICATED:
    case AiIntegration.CliAuthenticationStatus.INVALID:
    case AiIntegration.CliAuthenticationStatus.UNVERIFIED:
      return true;
    case AiIntegration.CliAuthenticationStatus.AUTHENTICATED:
    case AiIntegration.CliAuthenticationStatus.UNAVAILABLE:
    case AiIntegration.CliAuthenticationStatus.UNKNOWN:
      return false;
    default: {
      const exhaustive: never = authenticationStatus;
      return exhaustive;
    }
  }
}

function canStartAuthenticationFlow(state: AiIntegration.GetAiIntegrationStateResponse, isRemote: boolean): boolean {
  return (
    !isRemote &&
    state.cli.installationStatus === AiIntegration.CliInstallationStatus.INSTALLED &&
    canStartAuthentication(state.cli.authenticationStatus)
  );
}

function isAgentIntegrationAllowed(
  installationStatus: AiIntegration.CliInstallationStatus,
  authenticationStatus: AiIntegration.CliAuthenticationStatus,
  isRemote: boolean
): boolean {
  return (
    !isRemote &&
    installationStatus === AiIntegration.CliInstallationStatus.INSTALLED &&
    authenticationStatus === AiIntegration.CliAuthenticationStatus.AUTHENTICATED
  );
}

function authenticateParams(
  pick: Exclude<ConnectionPick, { kind: 'cancelled' }>
): AiIntegration.PrepareAuthenticateCliCommandParams {
  switch (pick.kind) {
    case 'none':
      return {};
    case 'connection': {
      const params: AiIntegration.PrepareAuthenticateCliCommandParams = { serverUrl: pick.connection.serverUrl };
      if (pick.connection.organization) {
        params.organization = pick.connection.organization;
      }
      return params;
    }
    default: {
      const exhaustive: never = pick;
      return exhaustive;
    }
  }
}

function noticeForTerminalExit(exitStatus?: vscode.TerminalExitStatus): CliSetupNotice {
  if (exitStatus?.reason === vscode.TerminalExitReason.User) {
    return { outcome: 'cancelled', message: TERMINAL_CANCELLED };
  }
  if (exitStatus?.code === 0) {
    return { outcome: 'completed', message: TERMINAL_COMPLETED };
  }
  if (exitStatus?.code === undefined) {
    return { outcome: 'unknown', message: TERMINAL_UNKNOWN };
  }
  return { outcome: 'failed', message: TERMINAL_FAILED };
}
