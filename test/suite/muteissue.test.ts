import { assert } from 'chai';
import { MUTE_TRANSITION_STATES, translateQuickPickToIssueStatus } from '../../src/issue/muteIssue';

suite('Mute Issue Test Suite', () => {
  test('getChildren should return all help and feedback view items', () => {
    assert.equal(translateQuickPickToIssueStatus(MUTE_TRANSITION_STATES[0]), 'WONT_FIX')
    assert.equal(translateQuickPickToIssueStatus(MUTE_TRANSITION_STATES[1]), 'FALSE_POSITIVE')
  });
});