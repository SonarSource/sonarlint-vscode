/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as vscode from 'vscode';
import { ExtendedClient } from '../lsp/protocol';

// Fixed to the authorized hackathon environment; never send this token to a workspace-defined host.
const API = 'https://api.sc-dev16.io/fix-suggestions/ai-suggestions';
const SECRET = 'refactor-with-proof.dev16.token';
export async function requestDev16CodeFix(
  context: vscode.ExtensionContext,
  uri: vscode.Uri,
  source: string,
  message: string,
  startLine: number,
  endLine: number,
  cancellation: vscode.CancellationToken
): Promise<ExtendedClient.ShowFixSuggestionParams> {
  const config = vscode.workspace.getConfiguration('sonarlint', uri);
  const projectKey = config.get<string>('refactorWithProof.projectKey');
  const organizationKey = config.get<string>('refactorWithProof.organizationKey');
  const guidance = config.get<string>('refactorWithProof.generationGuidance', '').trim();
  if (!projectKey || !organizationKey)
    throw new Error(
      'Set sonarlint.refactorWithProof.projectKey and organizationKey to your AI CodeFix-enabled Dev16 project.'
    );
  let token = await context.secrets.get(SECRET);
  if (!token) {
    token = await vscode.window.showInputBox({
      password: true,
      ignoreFocusOut: true,
      prompt: 'Dev16 SonarQube Cloud token for AI CodeFix (stored in VS Code SecretStorage)',
      placeHolder: 'Dev16 token'
    });
    if (!token) throw new Error('Dev16 token is required');
    await context.secrets.store(SECRET, token);
  }
  if (cancellation.isCancellationRequested) throw new Error('CodeFix cancelled');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  const cancel = cancellation.onCancellationRequested(() => controller.abort());
  try {
    const response = await fetch(API, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectKey,
        organizationKey,
        issue: {
          ruleKey: 'rust:S3776',
          sourceCode: source,
          message: guidance ? `${message}\nRefactoring constraints: ${guidance}` : message,
          startLine,
          endLine
        }
      })
    });
    if (!response.ok) {
      if (response.status === 401) await context.secrets.delete(SECRET);
      throw new Error(
        `Dev16 AI CodeFix returned HTTP ${response.status}. Check project access, AI CodeFix enablement and the deployment.`
      );
    }
    const result = (await response.json()) as any;
    if (
      typeof result.id !== 'string' ||
      typeof result.explanation !== 'string' ||
      !Array.isArray(result.changes) ||
      !result.changes.length
    ) {
      throw new Error('Unexpected AI CodeFix response');
    }
    return {
      suggestionId: result.id,
      explanation: result.explanation,
      fileUri: uri.toString(),
      isLocal: true,
      textEdits: result.changes.map(change => ({
        before: '',
        after: change.newCode ?? '',
        beforeLineRange: { startLine: change.startLine, endLine: change.endLine }
      }))
    };
  } finally {
    clearTimeout(timer);
    cancel.dispose();
  }
}
