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

export async function runCliUninstall(
  languageClient: SonarLintExtendedLanguageClient,
  isDisposed: () => boolean
): Promise<CliSetupNotice | undefined> {
  if (isDisposed()) {
    return undefined;
  }
  const state = await languageClient.getAiIntegrationState(
    getAiIntegrationStateParams(AiIntegration.AiIntegrationScope.GLOBAL)
  );
  if (isDisposed()) {
    return undefined;
  }
  if (!state.cli.uninstallAvailable) {
    return { outcome: 'failed', message: UNINSTALL_UNAVAILABLE };
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
    return undefined;
  }
  const response = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Uninstalling SonarQube CLI', cancellable: false },
    () => languageClient.uninstallCli()
  );
  for (const output of [response.stdout, response.stderr, response.message]) {
    if (output) {
      logToSonarLintOutput(output);
    }
  }
  return isDisposed() ? undefined : uninstallNotice(response);
}

export function cliUninstallFailure(error: unknown): CliSetupNotice {
  const diagnostic = error instanceof Error ? error.message : UNINSTALL_FAILED;
  logToSonarLintOutput(`Could not uninstall SonarQube CLI: ${diagnostic}`);
  return { outcome: 'failed', message: UNINSTALL_FAILED, showOutput: true };
}

function uninstallNotice(response: AiIntegration.UninstallCliResponse): CliSetupNotice {
  switch (response.status) {
    case AiIntegration.UninstallCliStatus.UNINSTALLED:
      return { outcome: 'completed', message: UNINSTALL_COMPLETED, showOutput: true };
    case AiIntegration.UninstallCliStatus.NOT_AVAILABLE:
      return { outcome: 'failed', message: response.message || UNINSTALL_UNAVAILABLE, showOutput: true };
    case AiIntegration.UninstallCliStatus.FAILED:
    default:
      return { outcome: 'failed', message: response.message || UNINSTALL_FAILED, showOutput: true };
  }
}
