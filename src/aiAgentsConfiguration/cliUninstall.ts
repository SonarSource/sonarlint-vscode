/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { AiIntegration } from '../lsp/aiIntegrationProtocol';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { logToSonarLintOutput } from '../util/logging';
import { getAiIntegrationStateParams } from './aiAgentUtils';
import type { CliSetupNotice } from './cliSetup';

const UNINSTALL_FAILED = 'Could not uninstall SonarQube CLI. Review the output for details.';
const UNINSTALL_UNAVAILABLE = 'This CLI installation cannot be uninstalled here. Refresh to check its state.';
const UNINSTALL_COMPLETED = 'SonarQube CLI was removed. Remove its PATH entry manually. Some configuration may remain; review the output.';

export interface CliUninstallResult {
  outcome: AiIntegration.AiIntegrationOutcome;
  notice?: CliSetupNotice;
}

export async function runCliUninstall(
  languageClient: SonarLintExtendedLanguageClient,
  isDisposed: () => boolean,
  onRpcStarted?: () => void
): Promise<CliUninstallResult> {
  if (isDisposed()) {
    return { outcome: { status: AiIntegration.AiIntegrationActionStatus.CANCELLED } };
  }
  const state = await languageClient.getAiIntegrationState(
    getAiIntegrationStateParams(AiIntegration.AiIntegrationScope.GLOBAL)
  );
  if (isDisposed()) {
    return { outcome: { status: AiIntegration.AiIntegrationActionStatus.CANCELLED } };
  }
  if (!state.cli.uninstallAvailable) {
    return {
      outcome: { status: AiIntegration.AiIntegrationActionStatus.FAILED },
      notice: { outcome: 'failed', message: UNINSTALL_UNAVAILABLE }
    };
  }
  const confirm = await vscode.window.showWarningMessage(
    'Uninstall SonarQube CLI?',
    {
      modal: true,
      detail: 'This removes the shared CLI used by terminals, IDEs, and agents. Reset removes credentials and registered integrations and may revoke recorded server tokens.'
    },
    'Uninstall'
  );
  if (confirm !== 'Uninstall' || isDisposed()) {
    return { outcome: { status: AiIntegration.AiIntegrationActionStatus.CANCELLED } };
  }
  const response = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Uninstalling SonarQube CLI', cancellable: false },
    () => {
      if (isDisposed()) {
        throw new vscode.CancellationError();
      }
      onRpcStarted?.();
      return languageClient.uninstallCli();
    }
  );
  if (!response) {
    return { outcome: { status: AiIntegration.AiIntegrationActionStatus.UNKNOWN } };
  }
  for (const output of [response.stdout, response.stderr, response.message]) {
    if (output) {
      logToSonarLintOutput(output);
    }
  }
  return uninstallResult(response);
}

export function cliUninstallFailure(error: unknown): CliUninstallResult {
  const diagnostic = error instanceof Error ? error.message : UNINSTALL_FAILED;
  logToSonarLintOutput(`Could not uninstall SonarQube CLI: ${diagnostic}`);
  return {
    outcome: { status: AiIntegration.AiIntegrationActionStatus.FAILED },
    notice: { outcome: 'failed', message: UNINSTALL_FAILED, showOutput: true }
  };
}

function uninstallResult(response: AiIntegration.UninstallCliResponse): CliUninstallResult {
  switch (response.status) {
    case AiIntegration.UninstallCliStatus.UNINSTALLED:
      return {
        outcome: { status: AiIntegration.AiIntegrationActionStatus.SUCCEEDED },
        notice: { outcome: 'completed', message: UNINSTALL_COMPLETED, showOutput: true }
      };
    case AiIntegration.UninstallCliStatus.NOT_AVAILABLE:
      return {
        outcome: { status: AiIntegration.AiIntegrationActionStatus.FAILED },
        notice: { outcome: 'failed', message: response.message || UNINSTALL_UNAVAILABLE, showOutput: true }
      };
    case AiIntegration.UninstallCliStatus.FAILED:
      return {
        outcome: { status: AiIntegration.AiIntegrationActionStatus.FAILED },
        notice: { outcome: 'failed', message: response.message || UNINSTALL_FAILED, showOutput: true }
      };
    default:
      return {
        outcome: { status: AiIntegration.AiIntegrationActionStatus.UNKNOWN },
        notice: { outcome: 'failed', message: response.message || UNINSTALL_FAILED, showOutput: true }
      };
  }
}
