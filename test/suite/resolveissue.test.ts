import { assert } from 'chai';
import { RESOLVE_TRANSITION_STATES, translateQuickPickToIssueStatus } from '../../src/issue/resolveIssue';

suite('Resolve Issue Test Suite', () => {
  test('getChildren should return all help and feedback view items', () => {
    assert.equal(translateQuickPickToIssueStatus(RESOLVE_TRANSITION_STATES[0]), 'WONT_FIX');
    assert.equal(translateQuickPickToIssueStatus(RESOLVE_TRANSITION_STATES[1]), 'FALSE_POSITIVE');
  });
});