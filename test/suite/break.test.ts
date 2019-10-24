/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2019 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { expect } from 'chai';

suite('Break CI', () => {
  test('Should fail CI on failed test assertion', () => {
    expect(false).to.be.true;
  });
});
