/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'assert';
import { parseMajorVersion } from '../../src/requirements';

suite('requirements', () => {
  test('should parse Java version', function() {
    //Test boundaries
    assert.equal(parseMajorVersion(null), 0);
    assert.equal(parseMajorVersion(''), 0);
    assert.equal(parseMajorVersion('foo'), 0);
    assert.equal(parseMajorVersion('version'), 0);
    assert.equal(parseMajorVersion('version ""'), 0);
    assert.equal(parseMajorVersion('version "NaN"'), 0);

    //Test the real stuff
    assert.equal(parseMajorVersion('version "1.7"'), 7);
    assert.equal(parseMajorVersion('version "1.8.0_151"'), 8);
    assert.equal(parseMajorVersion('version "9"'), 9);
    assert.equal(parseMajorVersion('version "9.0.1"'), 9);
    assert.equal(parseMajorVersion('version "10-ea"'), 10);
  });
});
