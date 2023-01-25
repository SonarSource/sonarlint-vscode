/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'assert';
import { parseMajorVersion } from '../../src/util/requirements';

suite('requirements', () => {
  test('should parse Java version', function() {
    //Test boundaries
    assert.strictEqual(parseMajorVersion(null), 0);
    assert.strictEqual(parseMajorVersion(''), 0);
    assert.strictEqual(parseMajorVersion('foo'), 0);
    assert.strictEqual(parseMajorVersion('version'), 0);
    assert.strictEqual(parseMajorVersion('version ""'), 0);
    assert.strictEqual(parseMajorVersion('version "NaN"'), 0);

    //Test the real stuff
    assert.strictEqual(parseMajorVersion('version "1.7"'), 7);
    assert.strictEqual(parseMajorVersion('version "1.8.0_151"'), 8);
    assert.strictEqual(parseMajorVersion('version "9"'), 9);
    assert.strictEqual(parseMajorVersion('version "9.0.1"'), 9);
    assert.strictEqual(parseMajorVersion('version "10-ea"'), 10);
  });
});
