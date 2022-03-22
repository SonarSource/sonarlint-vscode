/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'assert';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

const fs = require("fs");

const sampleCfamilyFolderLocation = '../../../samples/sample-cfamily/';

suite('CFamily Test Suite', () => {
  vscode.window.showInformationMessage('Start cfamily tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('sonarsource.sonarlint-vscode'));
  });

  test('should report issue on cpp file', async () => {
    vscode.workspace.getConfiguration().update('sonarlint.pathToCompileCommands', undefined, vscode.ConfigurationTarget.WorkspaceFolder);
    const ext = vscode.extensions.getExtension('sonarsource.sonarlint-vscode')!;
    await ext.activate();
    const fileUri = vscode.Uri.file(path.join(__dirname, sampleCfamilyFolderLocation, 'main.cpp'));

    const projectUri = vscode.Uri.file(path.join(__dirname, sampleCfamilyFolderLocation));

    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('SonarLint.ConfigureCompilationDatabase');
    const emptyPathToCompileCommands = vscode.workspace.getConfiguration('sonarlint', projectUri).get('pathToCompileCommands');
    assert.equal(emptyPathToCompileCommands, '');
    const firstCompileDbToCreatePath = path.join(__dirname, sampleCfamilyFolderLocation, 'compile_commands.json');
    const firstCompileDbToCreate = vscode.Uri.file(firstCompileDbToCreatePath);
    createCompilationDatabase(firstCompileDbToCreate.path);
    await vscode.commands.executeCommand('SonarLint.ConfigureCompilationDatabase');
    let pathToCompileCommands = vscode.workspace.getConfiguration('sonarlint', projectUri).get('pathToCompileCommands');
    assert.equal(pathToCompileCommands, firstCompileDbToCreate.path);

    const innerDir = path.join(__dirname, sampleCfamilyFolderLocation, "inner");
    createDir(innerDir);
    const secondCompileDbToCreate = vscode.Uri.file(path.join(__dirname, sampleCfamilyFolderLocation, "inner", 'compile_commands.json'));
    createCompilationDatabase(secondCompileDbToCreate.path);
    vscode.commands.executeCommand('SonarLint.ConfigureCompilationDatabase');
    await sleep(500);
    await vscode.commands.executeCommand('workbench.action.quickOpenNavigateNext');
    await sleep(500);
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    await sleep(500);
    pathToCompileCommands = vscode.workspace.getConfiguration('sonarlint', projectUri).get('pathToCompileCommands');
    assert.equal(pathToCompileCommands, secondCompileDbToCreate.path);
    vscode.commands.executeCommand('workbench.action.closeActiveEditor');


    // test cleanup
    fs.rmdir(innerDir, {recursive: true}, (err: any) => {
      if (err) {
        throw err;
      }
      console.log(`${innerDir} is deleted!`);
    });
    fs.unlink(firstCompileDbToCreatePath, (err: any) => {
      if (err) {
        throw err;
      }
      console.log(`${firstCompileDbToCreatePath} is deleted!`);
    });
    vscode.workspace.getConfiguration().update('sonarlint.pathToCompileCommands', undefined, vscode.ConfigurationTarget.WorkspaceFolder);
  }).timeout(10 * 1000);

});

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
}

function createCompilationDatabase(file: string) {
  fs.writeFileSync(file, "compilationDbContent");
}
