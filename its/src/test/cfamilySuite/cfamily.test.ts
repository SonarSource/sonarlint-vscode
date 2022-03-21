/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'assert';
import * as path from 'path';
import * as CompareVersions from 'compare-versions';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
const fs = require("fs");

import { waitForSonarLintDiagnostics } from '../common/util';

const sampleFolderLocation = '../../../samples/';
const sampleCfamilyFolderLocation = '../../../samples/sample-cfamily/';

suite('CFamily Test Suite', () => {
  vscode.window.showInformationMessage('Start cfamily tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('sonarsource.sonarlint-vscode'));
  });

  test('should report issue on cpp file',  async () => {
    vscode.workspace.getConfiguration().update('sonarlint.pathToCompileCommands', "");


    const ext = vscode.extensions.getExtension('sonarsource.sonarlint-vscode')!;
    await ext.activate();
    const fileUri = vscode.Uri.file(path.join(__dirname, sampleCfamilyFolderLocation, 'main.cpp'));


    const projectPath = vscode.Uri.file(path.join(__dirname, sampleCfamilyFolderLocation));

    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('SonarLint.ConfigureCompilationDatabase');
    const emptyPathToCompileCommands = vscode.workspace.getConfiguration().get('sonarlint.pathToCompileCommands');
    console.debug("emptyPathToCompileCommands: " + JSON.stringify(emptyPathToCompileCommands));

    createCompilationDatabase(sampleCfamilyFolderLocation);


    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }).timeout(10*1000);

});

function createCompilationDatabase(path:string) {
  let compilationDbContent = "[\n" +
    "{\n" +
    "  \"directory\": \"/home/knize/CLionProjects/TT/cmake-build-debug\",\n" +
    "  \"command\": \"/usr/bin/c++ -g -std=gnu++14 -o CMakeFiles/TT.dir/main.cpp.o -c /home/knize/CLionProjects/TT/main.cpp\",\n" +
    "  \"file\": \"/home/knize/CLionProjects/TT/main.cpp\"\n" +
    "}\n" +
    "]";

  fs.writeFileSync(`${path}compile_commands.json`, compilationDbContent);
}