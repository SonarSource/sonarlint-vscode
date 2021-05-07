/* --------------------------------------------------------------------------------------------
 * SonarLint Dogfood
 * Copyright (C) 2021-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as extension from '../../extension';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  suite('SEMVER + build compare implements a total order on Major, Minor, Version, Patch', () => {
    [
      ['1.20.0+12345', '2.0.0+12345', -1],
      ['1.20.0+12345', '1.21.0+12345', -1],
      ['1.20.0+12345', '1.20.1+12345', -1],
      ['1.20.0+12345', '1.20.0+12346', -1],
      ['1.20.0+2345', '1.20.0+12345', -1],

      ['1.20.0+12345', '1.20.0+12345', 0],

      ['1.20.0+12345', '1.20.0+2345', 1],
      ['1.20.0+12346', '1.20.0+12345', 1],
      ['1.20.1+12345', '1.20.0+12345', 1],
      ['1.21.0+12345', '1.20.0+12345', 1],
      ['2.0.0+12345', '1.20.0+12345', 1],
    ].forEach(args => {

      const [ v1, v2, expectedComparison ] = args;

      test(`Comparing ${v1} to ${v2} should return ${expectedComparison}`, () => {
        assert.strictEqual(expectedComparison as number, extension.semverPlusBuildCompare(v1 as string, v2 as string));
      });
    });

    test('An exception is thrown if argument 1 is not a valid semver+build', () => {
      assert.throws(() => extension.semverPlusBuildCompare('not semver', '1.2.3+456'), Error, 'Both versions should match X.Y.Z+BUILD');
    });

    test('An exception is thrown if argument 2 is not a valid semver+build', () => {
      assert.throws(() => extension.semverPlusBuildCompare('1.2.3+456', 'not semver'), Error, 'Both versions should match X.Y.Z+BUILD');
    });
  });
});
