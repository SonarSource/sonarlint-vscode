/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';

export const PROOF_CAPTIONS_VIEW = 'SonarQube.ProofDemoCaptions';
const PIPELINE_NOTE = 'Live Cloud generation · Local Lean verification · Review before applying';

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]
  );

/** Captions follow real pipeline events; they never substitute a recorded result. */
export class ProofDemoCaptions implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private title = 'Refactor with proof';
  private explanation = 'Trigger AI CodeFix for one Rust complexity issue.';
  private note = PIPELINE_NOTE;

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    this.render();
  }

  async show() {
    if (this.view) {
      this.view.show(true);
    } else {
      const editor = vscode.window.activeTextEditor;
      await vscode.commands.executeCommand(`${PROOF_CAPTIONS_VIEW}.focus`);
      if (editor) await vscode.window.showTextDocument(editor.document, editor.viewColumn);
    }
  }

  update(title: string, explanation: string, note = PIPELINE_NOTE) {
    this.title = title;
    this.explanation = explanation;
    this.note = note;
    this.render();
  }

  private render() {
    if (!this.view) return;
    const nonce = randomUUID();
    this.view.webview.html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';">
<style nonce="${nonce}">
  body { margin: 0; color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
  main { box-sizing: border-box; min-height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 12px 24px; text-align: center; }
  h1 { font-size: 27px; font-weight: 600; margin: 0 0 8px; }
  p { font-size: 19px; margin: 0 0 8px; }
  small { font-size: 13px; color: var(--vscode-descriptionForeground); }
</style></head><body><main aria-live="polite">
<h1>${escapeHtml(this.title)}</h1><p>${escapeHtml(this.explanation)}</p><small>${escapeHtml(this.note)}</small>
</main></body></html>`;
  }
}
