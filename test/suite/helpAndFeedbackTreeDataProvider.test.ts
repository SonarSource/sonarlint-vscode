/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { expect } from 'chai';
import { HelpAndFeedbackTreeDataProvider } from '../../src/help/helpAndFeedbackTreeDataProvider';
import { Commands } from '../../src/util/commands';

suite('Help and Feedback tree view test suite', () => {
  test('getChildren should return all help and feedback view items', () => {
    const underTest = new HelpAndFeedbackTreeDataProvider();
    const children = underTest.getChildren();
    expect(children.map(c => [ c.label, c.command.command ])).to.deep.equal([
      [ 'Read Documentation', Commands.TRIGGER_HELP_AND_FEEDBACK_LINK ],
      [ 'Get Help | Report Issue', Commands.TRIGGER_HELP_AND_FEEDBACK_LINK ],
      [ 'Suggest a Feature', Commands.TRIGGER_HELP_AND_FEEDBACK_LINK ],
      [ 'See Extension Logs', Commands.TRIGGER_HELP_AND_FEEDBACK_LINK ]
    ]);
  });
});
