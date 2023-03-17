/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { assert } from 'chai';
import { HelpAndFeedbackTreeDataProvider } from '../../src/help/helpAndFeedbackTreeDataProvider';
import { Commands } from '../../src/util/commands';

suite('Help and Feedback tree view test suite', () => {
  test('getChildren should return all help and feedback view items', () => {
    const underTest = new HelpAndFeedbackTreeDataProvider();
    const children = underTest.getChildren();
    assert.equal(children.length, 6);
    assert.equal(children[0].label, 'Read Documentation');
    assert.equal(children[1].label, 'Get Help | Report Issue');
    assert.equal(children[2].label, 'See Languages & Rules');
    assert.equal(children[3].label, "Check What's New");
    assert.equal(children[4].label, 'Suggest a Feature');
    assert.equal(children[5].label, 'Review FAQ');
    assert.equal(children[0].command.command, Commands.TRIGGER_HELP_AND_FEEDBACK_LINK);
  });
});
