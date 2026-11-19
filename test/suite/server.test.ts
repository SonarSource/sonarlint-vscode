/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import * as path from 'path';
import * as VSCode from 'vscode';
import { languageServerCommand } from '../../src/lsp/server';

suite('languageServerCommand', () => {
  const context = { extensionPath: path.resolve('extension') } as VSCode.ExtensionContext;
  const requirements = { javaHome: path.resolve('jre'), javaVersion: 21 };

  test('should launch the JVM with Base64 intrinsics disabled', () => {
    const { args } = languageServerCommand(context, requirements);

    expect(args).to.include('-XX:-UseBASE64Intrinsics');
    expect(args.indexOf('-XX:-UseBASE64Intrinsics')).to.be.lessThan(args.indexOf('-jar'));
  });

  test('should launch the configured Java executable', () => {
    const { command } = languageServerCommand(context, requirements);

    expect(command).to.equal(path.resolve(requirements.javaHome, 'bin', 'java'));
  });
});
