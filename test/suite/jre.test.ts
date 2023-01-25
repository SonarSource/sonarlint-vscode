/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { buildUrl } from '../../src/java/jre';
import { expect } from 'chai';

suite('jre', () => {
  suite('buildUrl', () => {
    test('should use defaults', () => {
      expect(buildUrl({ os: 'linux', architecture: 'x64' }))
        .equal('https://api.adoptopenjdk.net/v2/binary/releases/openjdk11?openjdk_impl=hotspot&os=linux&arch=x64&type=jre&heap_size=normal&release=latest');
    });

    test('should override defaults', () => {
      expect(buildUrl({ os: 'windows', architecture: 'x32', version: 13, binary: 'jdk' }))
        .equal('https://api.adoptopenjdk.net/v2/binary/releases/openjdk13?openjdk_impl=hotspot&os=windows&arch=x32&type=jdk&heap_size=normal&release=latest');
    });
  });
});
