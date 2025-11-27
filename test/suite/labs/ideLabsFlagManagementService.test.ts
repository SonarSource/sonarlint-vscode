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
import { IdeLabsFlagManagementService } from '../../../src/labs/ideLabsFlagManagementService';
import { ContextManager } from '../../../src/contextManager';

suite('IdeLabsFlagManagementService', () => {
  let context: vscode.ExtensionContext;
  let globalStateGetStub: sinon.SinonStub;
  let globalStateUpdateStub: sinon.SinonStub;
  let setIdeLabsJoinedContextStub: sinon.SinonStub;
  let setIdeLabsEnabledContextStub: sinon.SinonStub;
  let configurationUpdateStub: sinon.SinonStub;
  let configurationGetStub: sinon.SinonStub;

  setup(() => {
    globalStateGetStub = sinon.stub().returns(false);
    globalStateUpdateStub = sinon.stub().resolves();
    context = { globalState: { get: globalStateGetStub, update: globalStateUpdateStub } } as unknown as vscode.ExtensionContext;
    IdeLabsFlagManagementService.init(context);
    setIdeLabsJoinedContextStub = sinon.stub(ContextManager.instance, 'setIdeLabsJoinedContext');
    setIdeLabsEnabledContextStub = sinon.stub(ContextManager.instance, 'setIdeLabsEnabledContext');
    configurationGetStub = sinon.stub().returns(false);
    configurationUpdateStub = sinon.stub().returns(Promise.resolve());
    sinon.stub(vscode.workspace, 'getConfiguration').returns({
      get: configurationGetStub,
      update: configurationUpdateStub
    } as unknown as vscode.WorkspaceConfiguration);
  });

  teardown(() => {
    sinon.restore();
  });

  test('returns false by default', () => {
    const joined = IdeLabsFlagManagementService.instance.isIdeLabsJoined();
    expect(joined).to.be.false;
    const enabled = IdeLabsFlagManagementService.instance.isIdeLabsEnabled();
    expect(enabled).to.be.false;
  });

  test('join IDE Labs enables it by default', async () => {
    await IdeLabsFlagManagementService.instance.joinIdeLabs();
    expect(globalStateUpdateStub.calledWith('sonarqube.ideLabsJoined', true)).to.be.true;
    expect(setIdeLabsJoinedContextStub.calledWith(true)).to.be.true;
    expect(setIdeLabsEnabledContextStub.calledWith(true)).to.be.true;
    expect(configurationUpdateStub.calledWith('ideLabsEnabled', true, vscode.ConfigurationTarget.Global)).to.be.true;
  });

  test('disables IDE Labs does not sign out from labs', () => {
    IdeLabsFlagManagementService.instance.disableIdeLabs();
    expect(configurationUpdateStub.calledWith('ideLabsEnabled', false, vscode.ConfigurationTarget.Global)).to.be.true;
    expect(setIdeLabsEnabledContextStub.calledWith(false)).to.be.true;
    expect(globalStateUpdateStub.notCalled).to.be.true;
  });

  test('isIdeLabsEnabled returns false if IDE Labs is not joined but enabled', () => {
    globalStateGetStub.withArgs('sonarqube.ideLabsJoined').returns(false);
    configurationGetStub.returns(true);

    const enabled = IdeLabsFlagManagementService.instance.isIdeLabsEnabled();

    expect(enabled).to.be.false;
  });
});
