/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { IdeLabsFlagManagementService } from '../../src/labs/ideLabsFlagManagementService';
import { ContextManager } from '../../src/contextManager';

suite('IdeLabsFlagManagementService', () => {
  let context: vscode.ExtensionContext;
  let globalStateGetStub: sinon.SinonStub;
  let globalStateUpdateStub: sinon.SinonStub;
  let setIdeLabsContextStub: sinon.SinonStub;

  setup(() => {
    globalStateGetStub = sinon.stub().returns(false);
    globalStateUpdateStub = sinon.stub().resolves();
    context = { globalState: { get: globalStateGetStub, update: globalStateUpdateStub } } as unknown as vscode.ExtensionContext;
    IdeLabsFlagManagementService.init(context);
    setIdeLabsContextStub = sinon.stub(ContextManager.instance, 'setIdeLabsContext');
  });

  teardown(() => {
    sinon.restore();
  });

  test('returns false by default', () => {
    const enabled = IdeLabsFlagManagementService.instance.isIdeLabsEnabled();
    expect(enabled).to.be.false;
  });

  test('enables IDE Labs', async () => {
    await IdeLabsFlagManagementService.instance.enableIdeLabs();
    expect(globalStateUpdateStub.calledWith('sonarqube.ideLabsEnabled', true)).to.be.true;
    expect(setIdeLabsContextStub.calledWith(true)).to.be.true;
  });

  test('disables IDE Labs', async () => {
    await IdeLabsFlagManagementService.instance.disableIdeLabs();
    expect(globalStateUpdateStub.calledWith('sonarqube.ideLabsEnabled', false)).to.be.true;
    expect(setIdeLabsContextStub.calledWith(false)).to.be.true;
  });
});
