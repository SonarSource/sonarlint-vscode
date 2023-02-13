/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Uri } from 'vscode';
import {
  code2ProtocolConverter,
  getFileNameFromFullPath,
  getUriFromRelativePath,
  getRelativePathFromFullPath,
  protocol2CodeConverter
} from '../../src/util/uri';
import { expect } from 'chai';
import * as vscode from 'vscode';
import * as path from 'path';

suite('uri', () => {
  const { standardUri, codeUri } = /^win32/.test(process.platform)
    ? { standardUri: 'file:///c:/some/file.txt', codeUri: Uri.parse('file:///c%3A/some/file.txt') }
    : { standardUri: 'file:///some/file.txt', codeUri: Uri.parse('file:///some/file.txt') };

  test('should fix URI in code => ls message', () => {
    expect(code2ProtocolConverter(codeUri)).to.equal(standardUri);
  });

  test('should translate URI in ls => code message', () => {
    expect(protocol2CodeConverter(standardUri).toString()).to.equal(codeUri.toString());
  });

  test('should get relative path from full path without ws name', () => {
    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    const fullPath = `${workspaceFolder.uri}/samples/sample-js/main.js`;

    expect(getRelativePathFromFullPath(fullPath, workspaceFolder, false)).to.equal(`samples${path.sep}sample-js${path.sep}`);
  });

  test('should get relative path from full path with ws name', () => {
    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    const fullPath = `${workspaceFolder.uri}/samples/sample-js/main.js`;

    expect(getRelativePathFromFullPath(fullPath, workspaceFolder, true)).to.equal(
      `${workspaceFolder.name} • samples${path.sep}sample-js${path.sep}`
    );
  });

  test('should get file name from full path', () => {
    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    const fullPath = `${workspaceFolder.uri}/samples/sample-js/main.js`;

    expect(getFileNameFromFullPath(fullPath)).to.equal('main.js');
  });

  test('should get URI from relative path', () => {
    const relativePath = 'samples/sample-js/main.js';
    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    const expectedUri = `${workspaceFolder.uri}/samples/sample-js/main.js`;

    expect(getUriFromRelativePath(relativePath, workspaceFolder)).to.equal(expectedUri);
  });
});
