import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FixSuggestionService } from '../../src/fixSuggestions/fixSuggestionsService';
import { assert } from 'chai';

FixSuggestionService.init(null);
const fixSuggestionService = FixSuggestionService.instance;

suite('Fix Suggestions Service Test Suite', async () => {
	const folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tmpdir'));
	const filePath = path.join(folder, 'fixSuggestion.js');
	await fs.promises.writeFile(filePath, 'var i = 0;');
	const fileUri = vscode.Uri.parse(folder + '/fixSuggestion.js');
	const range = new vscode.Range(0, 0, 0, 10000);

	test('fixSuggestionService.isBeforeContentIdentical should return true when before content matches', async () => {
		const result = await fixSuggestionService.isBeforeContentIdentical(fileUri, range, 'var i = 0;');
		assert.isTrue(result);
	});

	test('fixSuggestionService.isBeforeContentIdentical should return false when before content does not match', async () => {
		const result = await fixSuggestionService.isBeforeContentIdentical(fileUri, range, 'var i = 1;');
		assert.isFalse(result);
	});
});