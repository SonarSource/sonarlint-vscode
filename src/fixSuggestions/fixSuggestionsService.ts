import { ExtendedClient } from "../lsp/protocol";
import * as vscode from "vscode";
import { logToSonarLintOutput } from "../util/logging";
import { SonarLintExtendedLanguageClient } from "../lsp/client";
import { pathExists } from "../util/uri";
import { showNoFileWithUriError } from "../util/showMessage";

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

	showFixSuggestion = async (params : ExtendedClient.ShowFixSuggestionParams) => {
		try {
			const fileUri = vscode.Uri.parse(params.fileUri);
			if (!(await pathExists(fileUri))) {
				// File doesn't exist - offer to view fix details instead
				const action = await vscode.window.showWarningMessage(
					'Could not find file. The file may have been deleted or moved.',
					'View Fix Details'
				);
				if (action === 'View Fix Details') {
					await this.showFixDetails(params, fileUri);
				}
				return;
			}
			const editor = await vscode.window.showTextDocument(fileUri);
			const wsedit = new vscode.WorkspaceEdit();
			let hasContentMismatch = false;
			for (const edit of params.textEdits) {
				await (async () => {
					const range = new vscode.Range(edit.beforeLineRange.startLine - 1, 0, edit.beforeLineRange.endLine - 1, FixSuggestionService.END_OF_LINE_OFFSET);
					const validRange = editor.document.validateRange(range);
					const isContentIdentical = params.isLocal || await this.isBeforeContentIdentical(fileUri, range, edit.before);
					if (!isContentIdentical) {
						hasContentMismatch = true;
					}
					wsedit.replace(fileUri, validRange, edit.after, {label: 'preview', needsConfirmation: true});
				})();
			}

			// If content has significantly changed, offer to view details before showing diff
			if (hasContentMismatch) {
				const action = await vscode.window.showWarningMessage(
					'The content of the file has changed. The fix suggestion may not be applicable.',
					'View Fix Details',
					'Try Anyway'
				);
				if (action === 'View Fix Details') {
					await this.showFixDetails(params, fileUri);
					this.client.fixSuggestionResolved(params.suggestionId, false);
					return;
				} else if (action !== 'Try Anyway') {
					// User dismissed the dialog
					this.client.fixSuggestionResolved(params.suggestionId, false);
					return;
				}
			}

			const result = await vscode.workspace.applyEdit(wsedit);
			// result will be true if at least one edit was applied
			// result will be false if no edits were applied
			if (result) {
				vscode.window.showInformationMessage('SonarQube for IDE: AI Fix applied.');
			} else {
				// Offer to show the fix details when declined or failed
				const action = await vscode.window.showInformationMessage(
					'SonarQube for IDE: AI Fix declined.',
					'View Fix Details'
				);
				if (action === 'View Fix Details') {
					await this.showFixDetails(params, fileUri);
				}
			}
			this.client.fixSuggestionResolved(params.suggestionId, result);
		} catch (error) {
			logToSonarLintOutput('Failed to apply edit: '.concat(error.message));
			// Offer to show fix details on error
			const action = await vscode.window.showErrorMessage(
				'Failed to apply AI Fix: ' + error.message,
				'View Fix Details'
			);
			if (action === 'View Fix Details') {
				const fileUri = vscode.Uri.parse(params.fileUri);
				await this.showFixDetails(params, fileUri);
			}
		}
	}

	private async showFixDetails(params: ExtendedClient.ShowFixSuggestionParams, fileUri: vscode.Uri): Promise<void> {
		// Create a markdown document to show the fix details with nice formatting
		const fileName = fileUri.path.split('/').pop() || 'file';
		const fileExtension = fileName.includes('.') ? fileName.split('.').pop() : '';

		let content = `# SonarQube AI Fix Suggestion\n\n`;
		content += `**File:** \`${fileName}\`\n\n`;
		content += `**Explanation:** ${params.explanation}\n\n`;
		content += `---\n\n`;

		for (let i = 0; i < params.textEdits.length; i++) {
			const edit = params.textEdits[i];
			const editNum = params.textEdits.length > 1 ? ` #${i + 1}` : '';
			content += `## Change${editNum}\n\n`;
			content += `**Lines:** ${edit.beforeLineRange.startLine}-${edit.beforeLineRange.endLine}\n\n`;

			content += `### Before\n\n`;
			content += `\`\`\`${fileExtension}\n`;
			content += edit.before;
			if (!edit.before.endsWith('\n')) {
				content += '\n';
			}
			content += `\`\`\`\n\n`;

			content += `### After\n\n`;
			content += `\`\`\`${fileExtension}\n`;
			content += edit.after;
			if (!edit.after.endsWith('\n')) {
				content += '\n';
			}
			content += `\`\`\`\n\n`;
		}

		content += `---\n\n`;
		content += `> 💡 **Tip:** You can manually copy and paste the "After" content to apply this fix.\n`;

		const doc = await vscode.workspace.openTextDocument({
			content,
			language: 'markdown'
		});
		await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
	}

	isBeforeContentIdentical = async (fileUri: vscode.Uri, range: vscode.Range, before: string) => {
		const doc = await vscode.workspace.openTextDocument(fileUri);
		return doc.getText(range) === before;
	}
}

