import { ShowFixSuggestionParams } from "../lsp/protocol";
import * as vscode from "vscode";
import { logToSonarLintOutput } from "../util/logging";
import { SonarLintExtendedLanguageClient } from "../lsp/client";

export class FixSuggestionService {
	private static readonly END_OF_LINE_OFFSET = 10000;
	private static _instance : FixSuggestionService;

	static init(client: SonarLintExtendedLanguageClient) {
		FixSuggestionService._instance = new FixSuggestionService(client);
	}
	constructor(private readonly client: SonarLintExtendedLanguageClient) {}

	static get instance() {
		return FixSuggestionService._instance;
	}

	showFixSuggestion = async (params : ShowFixSuggestionParams) => {
		try {
			const fileUri = vscode.Uri.parse(params.fileUri);
			const editor = await vscode.window.showTextDocument(fileUri);
			const wsedit = new vscode.WorkspaceEdit();
			for (const edit of params.textEdits) {
				await (async () => {
					const range = new vscode.Range(edit.beforeLineRange.startLine - 1, 0, edit.beforeLineRange.endLine - 1, FixSuggestionService.END_OF_LINE_OFFSET);
					const validRange = editor.document.validateRange(range);
					const isContentIdentical = await this.isBeforeContentIdentical(fileUri, range, edit.before);
					if (!isContentIdentical) {
						vscode.window.showWarningMessage('The content of the file has changed. The fix suggestion may not be applicable.');
					}
					wsedit.replace(fileUri, validRange, edit.after, {label: 'preview', needsConfirmation: true});
				})();
			}
			const result = await vscode.workspace.applyEdit(wsedit);
			// result will be true if at least one edit was applied
			// result will be false if no edits were applied
			this.client.fixSuggestionResolved(params.suggestionId, result);
		} catch (error) {
			logToSonarLintOutput('Failed to apply edit:'.concat(error.message));
		}
	}

	isBeforeContentIdentical = async (fileUri: vscode.Uri, range: vscode.Range, before: string) => {
		const doc = await vscode.workspace.openTextDocument(fileUri);
		return doc.getText(range) === before;
	}
}

