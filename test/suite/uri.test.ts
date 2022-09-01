/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Uri } from 'vscode';
import { code2ProtocolConverter, protocol2CodeConverter } from '../../src/util/uri';
import { expect } from 'chai';

suite('uri', () => {

  const { standardUri, codeUri } = /^win32/.test(process.platform) ?
    { standardUri: 'file:///c:/some/file.txt', codeUri: Uri.parse('file:///c%3A/some/file.txt')} :
    { standardUri: 'file:///some/file.txt', codeUri: Uri.parse('file:///some/file.txt') };

  test('should fix URI in code => ls message', () => {
    expect(code2ProtocolConverter(codeUri)).to.equal(standardUri);
  });

  test('should translate URI in ls => code message', () => {
    expect(protocol2CodeConverter(standardUri).toString()).to.equal(codeUri.toString());
  });
});
