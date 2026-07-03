import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as sinon from 'sinon';
import { FixSuggestionService } from '../../src/fixSuggestions/fixSuggestionsService';
import { IdeLabsFlagManagementService } from '../../src/labs/ideLabsFlagManagementService';
import { assert } from 'chai';

suite('Fix Suggestions Service Test Suite', () => {
  let fixSuggestionService: FixSuggestionService;
  let folder: string;
  let fileUri: vscode.Uri;
  let range: vscode.Range;

  suiteSetup(async () => {
    sinon.stub(IdeLabsFlagManagementService, 'instance').get(() => ({
      isIdeLabsEnabled: () => true,
      isIdeLabsJoined: () => true
    }));

    FixSuggestionService.init(null);
    fixSuggestionService = FixSuggestionService.instance;

    folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tmpdir'));
    const filePath = path.join(folder, 'fixSuggestion.js');
    await fs.promises.writeFile(filePath, 'var i = 0;');
    fileUri = vscode.Uri.file(filePath);
    range = new vscode.Range(0, 0, 0, 10000);
  });

  suiteTeardown(async () => {
    sinon.restore();
    if (folder) {
      await fs.promises.rm(folder, { recursive: true, force: true });
    }
  });

  test('fixSuggestionService.isBeforeContentIdentical should return true when before content matches', async () => {
    const result = await fixSuggestionService.isBeforeContentIdentical(fileUri, range, 'var i = 0;');
    assert.isTrue(result);
  });

  test('fixSuggestionService.isBeforeContentIdentical should return false when before content does not match', async () => {
    const result = await fixSuggestionService.isBeforeContentIdentical(fileUri, range, 'var i = 1;');
    assert.isFalse(result);
  });
});
