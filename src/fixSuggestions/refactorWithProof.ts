/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ExtendedClient } from '../lsp/protocol';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import {
  analyze,
  applyLineEdits,
  candidatePatch,
  isVerified,
  prepare,
  projectDigest,
  resolveImage,
  snapshot,
  verify
} from './proofWorker';

import { requestDev16CodeFix } from './dev16CodeFix';
import { ProofDemoCaptions, PROOF_CAPTIONS_VIEW } from './proofDemoCaptions';

const COMMAND = 'SonarQube.RefactorWithProof';
const NATIVE_COMMAND = 'SonarLint.SuggestFixFromCodeAction';
const pending = new Map<string, (suggestion: ExtendedClient.ShowFixSuggestionParams) => void>();
const previews = new Map<string, string>();
const enabled = (uri: vscode.Uri) =>
  vscode.workspace.getConfiguration('sonarlint', uri).get<boolean>('refactorWithProof.enabled', false);
const isIssue = (d: vscode.Diagnostic) => (typeof d.code === 'object' ? d.code.value : d.code) === 'rust:S3776';

export function interceptProofSuggestion(params: ExtendedClient.ShowFixSuggestionParams): boolean {
  const receive = pending.get(params.fileUri);
  if (!receive) return false;
  pending.delete(params.fileUri);
  receive(params);
  return true;
}

export function registerRefactorWithProof(context: vscode.ExtensionContext, client: SonarLintExtendedLanguageClient) {
  const captions = new ProofDemoCaptions();
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(PROOF_CAPTIONS_VIEW, captions));
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('sonar-proof', {
      provideTextDocumentContent: uri => previews.get(uri.toString()) ?? ''
    })
  );
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { language: 'rust', scheme: 'file' },
      {
        provideCodeActions(document, _range, actionContext) {
          if (!enabled(document.uri)) return [];
          const issues = actionContext.diagnostics.filter(isIssue);
          return (issues.length ? issues : [undefined]).map(diagnostic => {
            const action = new vscode.CodeAction(
              'SonarQube: Refactor with proof (Hackathon)',
              vscode.CodeActionKind.RefactorRewrite
            );
            if (diagnostic) action.diagnostics = [diagnostic];
            action.command = { title: action.title, command: COMMAND, arguments: [document.uri, diagnostic] };
            return action;
          });
        }
      },
      { providedCodeActionKinds: [vscode.CodeActionKind.RefactorRewrite] }
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND, async (uri?: vscode.Uri, diagnostic?: vscode.Diagnostic) => {
      uri ??= vscode.window.activeTextEditor?.document.uri;
      if (!uri || !enabled(uri))
        return void vscode.window.showErrorMessage('Enable sonarlint.refactorWithProof.enabled for this demo.');
      const fileUri = uri;
      const document = await vscode.workspace.openTextDocument(uri);
      diagnostic ??= vscode.languages
        .getDiagnostics(uri)
        .find(
          d =>
            isIssue(d) &&
            d.range.contains(vscode.window.activeTextEditor?.selection.active ?? new vscode.Position(0, 0))
        );
      if (document.languageId !== 'rust' || (diagnostic && !isIssue(diagnostic))) {
        return void vscode.window.showErrorMessage('Select one Rust cognitive-complexity issue (rust:S3776).');
      }
      if (!vscode.workspace.isTrusted || vscode.workspace.textDocuments.some(d => d.isDirty)) {
        return void vscode.window.showErrorMessage('Trust the workspace and save all files before requesting a proof.');
      }
      if (pending.has(uri.toString()))
        return void vscode.window.showErrorMessage('A CodeFix request is already pending for this file.');
      const demoPresentation = vscode.workspace
        .getConfiguration('sonarlint', fileUri)
        .get<boolean>('refactorWithProof.demoPresentation', false);
      try {
        if (demoPresentation) {
          captions.update('Preparing one Rust function', 'Freeze the original project and translate it into Lean.');
          await captions.show();
        }
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Refactor with proof', cancellable: true },
          async (progress, token) => {
            const actions = diagnostic
              ? await vscode.commands.executeCommand<(vscode.CodeAction | vscode.Command)[]>(
                  'vscode.executeCodeActionProvider',
                  fileUri,
                  diagnostic.range
                )
              : [];
            const native = actions
              ?.map(a => ('command' in a && typeof a.command === 'object' ? a.command : (a as vscode.Command)))
              .find(a => a?.command === NATIVE_COMMAND);
            let project = path.dirname(fileUri.fsPath);
            while (true) {
              try {
                await fs.access(path.join(project, 'Cargo.toml'));
                break;
              } catch {
                /* search parent */
              }
              const parent = path.dirname(project);
              if (parent === project) throw new Error('No Cargo.toml found');
              project = parent;
            }
            const config = vscode.workspace.getConfiguration('sonarlint', fileUri);
            const symbol = config.get<string>('refactorWithProof.symbol');
            if (!symbol)
              throw new Error(
                'Set sonarlint.refactorWithProof.symbol to the qualified function, for example crate::classify.'
              );
            let threshold = diagnostic
              ? Number(/to the (\d+) allowed/.exec(diagnostic.message)?.[1])
              : config.get<number>('refactorWithProof.maxComplexity', 30);
            if (!Number.isInteger(threshold) || threshold < 0)
              throw new Error('Cannot determine the complexity threshold.');
            await fs.mkdir(context.globalStorageUri.fsPath, { recursive: true });
            const job = await fs.mkdtemp(path.join(context.globalStorageUri.fsPath, 'proof-'));
            const original = document.getText();
            progress.report({ message: 'Preparing original Rust → Lean translation…' });
            const digest = await snapshot(project, path.join(job, 'baseline'));
            if (
              (await fs.readFile(path.join(job, 'baseline', path.relative(project, fileUri.fsPath)), 'utf8')) !==
              original
            )
              throw new Error('Save the original file and retry.');
            const image = await resolveImage(
              config.get<string>('refactorWithProof.dockerImage', 'cognitive-verifier:integration')
            );
            const relativeFile = path.relative(project, fileUri.fsPath);
            if (!diagnostic) {
              const analysis = await analyze(job, image, relativeFile, token);
              const functions = analysis.functions.filter(f => f.name === symbol.split('::').pop());
              if (functions.length !== 1)
                throw new Error('Configured symbol must identify exactly one function in this file.');
              const fn = functions[0];
              if (fn.cognitiveComplexity <= threshold)
                throw new Error('Selected function is already below the configured complexity threshold.');
              diagnostic = new vscode.Diagnostic(
                new vscode.Range(fn.range.start.line - 1, 0, fn.range.end.line - 1, 0),
                `Refactor this function to reduce its Cognitive Complexity from ${fn.cognitiveComplexity} to the ${threshold} allowed.`
              );
              diagnostic.code = 'rust:S3776';
              diagnostic.source = 'cogc (Hackathon demo)';
            }
            const prepared = await prepare(
              job,
              image,
              {
                id: 'issue',
                project: '.',
                file: path.relative(project, fileUri.fsPath),
                symbol,
                charonSymbol: config.get<string>('refactorWithProof.charonSymbol') || undefined,
                cargoTarget: 'lib',
                maxComplexity: Number(threshold),
                issueLine: diagnostic.range.start.line + 1
              },
              token
            );
            progress.report({ message: 'Requesting refactor from existing AI CodeFix endpoint…' });
            if (demoPresentation)
              captions.update(
                'AI CodeFix generates the refactor',
                'A live Cloud request targets the selected complexity issue.'
              );
            const suggestion = native
              ? await new Promise<ExtendedClient.ShowFixSuggestionParams>((resolve, reject) => {
                  let expired = false;
                  const timer = setTimeout(() => {
                    expired = true;
                    cancellation.dispose();
                    reject(new Error('CodeFix timed out. Any late suggestion will be discarded.'));
                  }, 180_000);
                  const cancellation = token.onCancellationRequested(() => {
                    expired = true;
                    clearTimeout(timer);
                    reject(new Error('CodeFix cancelled. Any late suggestion will be discarded.'));
                  });
                  // Retain this receiver after timeout/cancellation so a late response cannot enter the ordinary apply flow.
                  pending.set(fileUri.toString(), params => {
                    clearTimeout(timer);
                    cancellation.dispose();
                    if (expired || token.isCancellationRequested) {
                      void client.fixSuggestionResolved(params.suggestionId, false);
                      return;
                    }
                    resolve(params);
                  });
                  void vscode.commands
                    .executeCommand(native.command, ...(native.arguments ?? []))
                    .then(undefined, error => {
                      clearTimeout(timer);
                      cancellation.dispose();
                      pending.delete(fileUri.toString());
                      reject(error);
                    });
                })
              : await requestDev16CodeFix(
                  context,
                  fileUri,
                  original,
                  diagnostic.message,
                  diagnostic.range.start.line + 1,
                  diagnostic.range.end.line + 1,
                  token
                );
            if (token.isCancellationRequested) throw new Error('Verification cancelled');
            const candidate = applyLineEdits(original, suggestion.textEdits);
            const patch = candidatePatch(path.relative(project, fileUri.fsPath), original, candidate);
            progress.report({ message: 'Checking complexity and proving the exact diff…' });
            if (demoPresentation)
              captions.update(
                'Lean checks the generated refactor',
                'Local verification checks the exact candidate asynchronously.'
              );
            let result: any;
            try {
              result = await verify(job, image, prepared, patch, token);
            } catch (error) {
              result = { stage: 'not_verified', detail: error.message };
            }
            if (token.isCancellationRequested) throw new Error('Verification cancelled');
            await fs.writeFile(path.join(job, 'candidate.rs'), candidate);
            await fs.writeFile(path.join(job, 'suggestion.json'), JSON.stringify(suggestion, null, 2));
            const verified = isVerified(result);
            const complexity = result.targets?.[0]?.complexity;
            const score = complexity
              ? `${complexity.before} → ${complexity.after} (allowed ${complexity.threshold})`
              : `Original ${prepared.targets.issue.complexity}; candidate improvement not established`;
            const report = `# Refactor with proof\n\n**${verified ? 'Verified Lean models' : 'Not verified'}**\n\nCognitive complexity: ${score}\n\n${result.detail ?? result.stage}\n\n## Assumptions and limits\n\n- Equality applies to Aeneas-generated Lean models; complete Rust semantics and trusted external models have not been audited.\n- Linux Cargo library target, default features; dependencies must be cached in the local Docker image.\n- One selected function and issue. Sonar analysis must confirm resolution after applying.\n- A failed proof is not evidence that the refactor is incorrect. Inspect the worker report for counterexamples or unsupported constructs.\n\n## AI explanation\n\n${suggestion.explanation}${!native && config.get<string>('refactorWithProof.generationGuidance') ? '\n\n## Generation constraints\n\n' + config.get<string>('refactorWithProof.generationGuidance') : ''}\n\n## Evidence\n\nIssue source: ${diagnostic.source ?? 'SonarQube'}\n\nOriginal digest: ${digest}\n\nWorker artifacts and exact patch: ${job}\n`;
            await fs.writeFile(path.join(job, 'review.md'), report);
            if (demoPresentation) {
              captions.update(
                verified ? `Lean models verified · ${score}` : `Not verified · ${score}`,
                verified
                  ? 'The candidate is saved. Review is required before applying.'
                  : 'The candidate is saved for review. A failed proof does not establish incorrectness.',
                'Proof scope: Aeneas-generated Lean models; full Rust semantics and external models remain assumptions.'
              );
              if (native) void client.fixSuggestionResolved(suggestion.suggestionId, false);
              return;
            }
            const review = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(job, 'review.md')));
            await vscode.window.showTextDocument(review, vscode.ViewColumn.Beside);
            const id = randomUUID();
            const before = vscode.Uri.parse(`sonar-proof:/${id}/original.rs`),
              after = vscode.Uri.parse(`sonar-proof:/${id}/candidate.rs`);
            previews.set(before.toString(), original);
            previews.set(after.toString(), candidate);
            await vscode.commands.executeCommand(
              'vscode.diff',
              before,
              after,
              `Refactor with proof · ${verified ? 'Verified Lean models' : 'Not verified'} · ${score}`
            );
            const choice = await vscode.window.showInformationMessage(
              `Review the diff and assumptions. ${verified ? 'Lean models verified.' : 'Not verified; this does not mean incorrect.'}`,
              'Apply reviewed refactor',
              'Keep for review'
            );
            let applied = false;
            if (choice === 'Apply reviewed refactor') {
              if (token.isCancellationRequested) throw new Error('Verification cancelled');
              if (document.isDirty || document.getText() !== original || (await projectDigest(project)) !== digest) {
                throw new Error('Original project changed. Generate and verify a fresh suggestion before applying.');
              }
              const edit = new vscode.WorkspaceEdit();
              edit.replace(
                fileUri,
                new vscode.Range(document.positionAt(0), document.positionAt(original.length)),
                candidate,
                { label: 'Reviewed refactor with proof', needsConfirmation: true }
              );
              applied = await vscode.workspace.applyEdit(edit);
            }
            if (native) void client.fixSuggestionResolved(suggestion.suggestionId, applied);
          }
        );
      } catch (error) {
        if (demoPresentation)
          captions.update(
            'Refactor request stopped',
            error.message,
            'No candidate was applied. Inspect the error before retrying.'
          );
        void vscode.window.showErrorMessage(`Refactor with proof: ${error.message}`);
      }
    })
  );
}
