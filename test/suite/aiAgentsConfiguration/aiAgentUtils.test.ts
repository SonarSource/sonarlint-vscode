/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {
  INTEGRATION_TARGET,
  getCurrentIdeHost,
  getDetectedIdeAgents,
  IDE_HOST
} from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import { SETUP_TEARDOWN_HOOK_TIMEOUT } from '../commons';

suite('aiAgentUtils', () => {
  setup(function () {
    this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
  });

  teardown(() => sinon.restore());

  test('detects extensions available in VS Code without reporting Cursor', () => {
    sinon.stub(vscode.env, 'appName').value('Visual Studio Code');
    sinon.stub(vscode.extensions, 'getExtension').callsFake(extensionId => {
      if (['github.copilot-chat', 'openai.chatgpt'].includes(extensionId)) {
        return { id: extensionId } as vscode.Extension<unknown>;
      }
      return undefined;
    });

    expect(getCurrentIdeHost()).to.deep.equal({
      id: IDE_HOST.VS_CODE,
      name: 'VS Code'
    });
    expect(getDetectedIdeAgents().map(agent => agent.id)).to.deep.equal([
      INTEGRATION_TARGET.GITHUB_COPILOT,
      INTEGRATION_TARGET.CODEX
    ]);
  });

  test('reports Cursor only when hosted by Cursor', () => {
    sinon.stub(vscode.env, 'appName').value('Cursor');
    sinon.stub(vscode.extensions, 'getExtension').returns(undefined);

    expect(getDetectedIdeAgents()).to.deep.equal([
      {
        id: INTEGRATION_TARGET.CURSOR,
        name: 'Cursor',
        source: 'builtIn'
      }
    ]);
  });
});
