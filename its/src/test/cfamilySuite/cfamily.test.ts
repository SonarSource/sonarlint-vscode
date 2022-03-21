/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'assert';
import * as path from 'path';
import * as nutTree from '@nut-tree/nut-js';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import {Key} from "@nut-tree/nut-js";
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

    const firstCompileDbToCreate = vscode.Uri.file(path.join(__dirname, sampleCfamilyFolderLocation, 'compile_commands.json'));
    createCompilationDatabase(firstCompileDbToCreate.path);
    await vscode.commands.executeCommand('SonarLint.ConfigureCompilationDatabase');
    let pathToCompileCommands = vscode.workspace.getConfiguration('sonarlint', projectUri).get('pathToCompileCommands');
    assert.equal(pathToCompileCommands, firstCompileDbToCreate.path);

    const secondFolderToCreate = vscode.Uri.file(path.join(__dirname, sampleCfamilyFolderLocation, "inner", 'compile_commands.json'));
    createCompilationDatabase(secondFolderToCreate.path);
    vscode.commands.executeCommand('SonarLint.ConfigureCompilationDatabase');
    await sleep(2000);
    await nutTree.keyboard.pressKey(Key.Down);
    await nutTree.keyboard.releaseKey(Key.Down);
    await sleep(2000);
    await nutTree.keyboard.pressKey(Key.Enter);
    await nutTree.keyboard.releaseKey(Key.Enter);
    await sleep(2000);
    pathToCompileCommands = vscode.workspace.getConfiguration('sonarlint', projectUri).get('pathToCompileCommands');
    assert.equal(pathToCompileCommands, secondFolderToCreate.path);
    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }).timeout(10 * 1000);

});

function sleep(ms:number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


function createCompilationDatabase(file: string) {
  let compilationDbContent = "[\n" +
    "{\n" +
    "  \"directory\": \"/home/knize/CLionProjects/TT/cmake-build-debug\",\n" +
    "  \"command\": \"/usr/bin/c++ -g -std=gnu++14 -o CMakeFiles/TT.dir/main.cpp.o -c /home/knize/CLionProjects/TT/main.cpp\",\n" +
    "  \"file\": \"/home/knize/CLionProjects/TT/main.cpp\"\n" +
    "}\n" +
    "]";

  fs.writeFileSync(file, compilationDbContent);
}