/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as sinon from 'sinon';
import { expect } from 'chai';
import { HelpAndFeedbackTreeDataProvider } from '../../src/help/helpAndFeedbackTreeDataProvider';
import { IdeLabsFlagManagementService } from '../../src/labs/ideLabsFlagManagementService';
import { Commands } from '../../src/util/commands';

suite('Help and Feedback tree view test suite', () => {
  let ideLabsStub: sinon.SinonStub;

  setup(() => {
    ideLabsStub = sinon.stub(IdeLabsFlagManagementService, 'instance').get(() => ({
      isIdeLabsEnabled: () => false
    }));
  });

  teardown(() => {
    sinon.restore();
  });

  test('getChildren should return non-labs items when labs is disabled', () => {
    const underTest = new HelpAndFeedbackTreeDataProvider([]);
    const children = underTest.getChildren();
    expect(children.map(c => [ c.label, c.command.command ])).to.deep.equal([
      [ 'Read Documentation', Commands.TRIGGER_HELP_AND_FEEDBACK_LINK ],
      [ 'Get Help | Report Issue', Commands.TRIGGER_HELP_AND_FEEDBACK_LINK ],
      [ 'Suggest a Feature', Commands.TRIGGER_HELP_AND_FEEDBACK_LINK ],
      [ 'See Extension Logs', Commands.TRIGGER_HELP_AND_FEEDBACK_LINK ]
    ]);
  });

  test('getChildren should include labs-only items when labs is enabled', () => {
    ideLabsStub.get(() => ({ isIdeLabsEnabled: () => true }));
    const underTest = new HelpAndFeedbackTreeDataProvider([]);
    const children = underTest.getChildren();
    expect(children.map(c => c.label)).to.include('Supported Languages & Analyzers');
  });
});
