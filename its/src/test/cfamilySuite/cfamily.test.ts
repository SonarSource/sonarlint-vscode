/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {describe, after, before, it} from 'mocha';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

const sampleCFamilyFolderLocation = '../../../samples/sample-cfamily/';
const firstCompileDbToCreatePath = path.join(__dirname, sampleCFamilyFolderLocation, 'compile_commands.json');
const firstCompileDbToCreate = vscode.Uri.file(firstCompileDbToCreatePath);
const innerDir = path.join(__dirname, sampleCFamilyFolderLocation, 'inner');
const projectUri = vscode.Uri.file(path.join(__dirname, sampleCFamilyFolderLocation));

describe('CFamily Test Suite', () => {
  vscode.window.showInformationMessage('Start cfamily tests.');

  before(async function () {
    await resetPathToCompileCommands();
  });

  it('should detect compilation database correctly', async () => {

    const ext = vscode.extensions.getExtension('sonarsource.sonarlint-vscode')!;
    await ext.activate();
    const fileUri = vscode.Uri.file(path.join(__dirname, sampleCFamilyFolderLocation, 'main.cpp'));
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);

    await vscode.commands.executeCommand('SonarLint.ConfigureCompilationDatabase');
    const emptyPathToCompileCommands = getProjectConfiguration().get('pathToCompileCommands');
    assert.equal(emptyPathToCompileCommands, '', 'should have empty compile commands initially');

    createCompilationDatabase(firstCompileDbToCreate.path);
    await vscode.commands.executeCommand('SonarLint.ConfigureCompilationDatabase');
    let pathToCompileCommands = getProjectConfiguration().get('pathToCompileCommands');
    assert.equal(pathToCompileCommands, '${workspaceFolder}/compile_commands.json', 'should have selected default one');

    createDir(innerDir);
    const secondCompileDbToCreate = vscode.Uri.file(path.join(__dirname, sampleCFamilyFolderLocation, 'inner', 'compile_commands.json'));
    createCompilationDatabase(secondCompileDbToCreate.path);
    vscode.commands.executeCommand('SonarLint.ConfigureCompilationDatabase');
    // Wait for the input field to show
    await sleep(1000);
    await vscode.commands.executeCommand('workbench.action.quickOpenNavigateNext');
    // Wait for the selection to happen
    await sleep(1000);
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    // Wait for the settings to be updated
    await sleep(2000);
    pathToCompileCommands = getProjectConfiguration().get('pathToCompileCommands');
    assert.equal(pathToCompileCommands, '${workspaceFolder}/inner/compile_commands.json', 'should have chosen "inner" one');
    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }).timeout(30 * 1000);

  // test cleanup
  after(async function () {
    const vscodeProjectSettingsPath = path.join(__dirname, sampleCFamilyFolderLocation, '.vscode');
    removeDir(vscodeProjectSettingsPath);
    removeDir(innerDir);
    if (fs.existsSync(firstCompileDbToCreatePath)) {
      fs.unlink(firstCompileDbToCreatePath, (err: any) => {
        if (err) {
          throw err;
        }
        console.log(`${firstCompileDbToCreatePath} is deleted!`);
      });
    }
  });
});

function getProjectConfiguration() {
  return vscode.workspace.getConfiguration('sonarlint', projectUri);
}

async function resetPathToCompileCommands() {
  await getProjectConfiguration().update('pathToCompileCommands', undefined, vscode.ConfigurationTarget.WorkspaceFolder);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function removeDir(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmdir(dir, {recursive: true}, (err: any) => {
      if (err) {
        throw err;
      }
      console.log(`${dir} is deleted!`);
    });
  }
}

function createDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
}

function createCompilationDatabase(file: string) {
  fs.writeFileSync(file, 'compilationDbContent');
}
