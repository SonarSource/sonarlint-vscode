import { ShowFixSuggestionParams } from "../lsp/protocol";
import * as vscode from "vscode";

export async function showFixSuggestion(params : ShowFixSuggestionParams) {
	try {
		const fileUri = vscode.Uri.parse(params.fileUri);
		await vscode.window.showTextDocument(fileUri);
		const wsedit = new vscode.WorkspaceEdit();
		params.textEdits.forEach(async (edit) => {
			const range = new vscode.Range(edit.beforeLineRange.startLine, 0, edit.beforeLineRange.endLine, 10000);
			isBeforeContentIdentical(fileUri, range, edit.before);
			wsedit.replace(fileUri, range, edit.after, {label: 'preview', needsConfirmation: true});
		});
        const result = await vscode.workspace.applyEdit(wsedit);
		// result will be true if at least one edit was applied
		// result will be false if no edits were applied
        console.log('Edit applied successfully:', result);
    } catch (error) {
        console.error('Failed to apply edit:', error);
    }
}

async function isBeforeContentIdentical(fileUri: vscode.Uri, range: vscode.Range, before: string) {
	const doc = await vscode.workspace.openTextDocument(fileUri);
	const content = doc.getText(range);
	if (content !== before) {
		await vscode.window.showWarningMessage('The content of the file has changed. The fix suggestion may not be applicable.');
	}
}