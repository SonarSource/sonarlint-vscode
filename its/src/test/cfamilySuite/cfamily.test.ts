/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'assert';
import * as path from 'path';
import * as mocha from 'mocha'

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

const fs = require("fs");

const sampleCFamilyFolderLocation = '../../../samples/sample-cfamily/';

mocha.describe('CFamily Test Suite', () => {
  vscode.window.showInformationMessage('Start cfamily tests.');

  let firstCompileDbToCreatePath:string;
  let firstCompileDbToCreate:vscode.Uri;
  let innerDir:string;
  let projectUri:vscode.Uri;

  mocha.before(async function () {
    projectUri = vscode.Uri.file(path.join(__dirname, sampleCFamilyFolderLocation));
    await vscode.workspace.getConfiguration('sonarlint', projectUri).update('pathToCompileCommands', undefined, vscode.ConfigurationTarget.WorkspaceFolder);
    firstCompileDbToCreatePath = path.join(__dirname, sampleCFamilyFolderLocation, 'compile_commands.json');
    firstCompileDbToCreate = vscode.Uri.file(firstCompileDbToCreatePath);
    innerDir = path.join(__dirname, sampleCFamilyFolderLocation, "inner");
  });

  mocha.it('should detect compilation database correctly', async () => {

    const ext = vscode.extensions.getExtension('sonarsource.sonarlint-vscode')!;
    await ext.activate();
    const fileUri = vscode.Uri.file(path.join(__dirname, sampleCFamilyFolderLocation, 'main.cpp'));
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);

    await vscode.commands.executeCommand('SonarLint.ConfigureCompilationDatabase');
    const emptyPathToCompileCommands = vscode.workspace.getConfiguration('sonarlint', projectUri).get('pathToCompileCommands');
    assert.equal(emptyPathToCompileCommands, '');

    createCompilationDatabase(firstCompileDbToCreate.path);
    await vscode.commands.executeCommand('SonarLint.ConfigureCompilationDatabase');
    let pathToCompileCommands = vscode.workspace.getConfiguration('sonarlint', projectUri).get('pathToCompileCommands');
    assert.equal(pathToCompileCommands, firstCompileDbToCreate.path);

    createDir(innerDir);
    const secondCompileDbToCreate = vscode.Uri.file(path.join(__dirname, sampleCFamilyFolderLocation, "inner", 'compile_commands.json'));
    createCompilationDatabase(secondCompileDbToCreate.path);
    vscode.commands.executeCommand('SonarLint.ConfigureCompilationDatabase');
    await sleep(1000);
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    await sleep(1000);
    pathToCompileCommands = vscode.workspace.getConfiguration('sonarlint', projectUri).get('pathToCompileCommands');
    assert.equal(pathToCompileCommands, secondCompileDbToCreate.path);
    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }).timeout(30 * 1000);

  // test cleanup
  mocha.after(async function () {
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
    await vscode.workspace.getConfiguration('sonarlint', projectUri).update('pathToCompileCommands', undefined, vscode.ConfigurationTarget.WorkspaceFolder);
  });
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
