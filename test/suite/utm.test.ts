/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';

import { addUtmIfNeeded } from '../../src/util/utm';

suite('utm', () => {

  test('should return unchanged URL when no UTM is passed', () => {
    const baseUrl = 'https://example.com/some/path/';

    const underTest = addUtmIfNeeded(baseUrl, undefined);

    expect(underTest).to.equal(baseUrl);
  });

  test('should add UTM parameters to simple URL', () => {
    const baseUrl = 'https://example.com/some/path/';

    const underTest = addUtmIfNeeded(baseUrl, { content: 'some-content', term: 'some-term'});

    [
      'utm_medium=referral',
      'utm_source=sq-ide-product-vscode',
      'utm_content=some-content',
      'utm_term=some-term',
    ].forEach(param => {
      expect(underTest).to.have.string(param);
    });
    expect(new URL(underTest)).to.not.be.null;
  });

  test('should add UTM parameters to URL and preserve existing parameters', () => {
    const baseUrl = 'https://example.com/login?return_to=%2Fsonarlint%2Fauth%3FideName%3DVisual%2BStudio%2BCode%26port%3D64121&error=sq_ide_token_creation';

    const underTest = addUtmIfNeeded(baseUrl, { content: 'some-content', term: 'some-term'});

    [
      'utm_medium=referral',
      'utm_source=sq-ide-product-vscode',
      'utm_content=some-content',
      'utm_term=some-term',
      'return_to=%2Fsonarlint%2Fauth%3FideName%3DVisual%2BStudio%2BCode%26port%3D64121',
      'error=sq_ide_token_creation',
    ].forEach(param => {
      expect(underTest).to.have.string(param);
    });
    expect(new URL(underTest)).to.not.be.null;
  });
});
