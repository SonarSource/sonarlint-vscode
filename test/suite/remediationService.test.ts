/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as sinon from 'sinon';
import { expect } from 'chai';
import { RemediationService } from '../../src/remediationPanel/remediationService';
import { RemediationEventType } from '../../src/remediationPanel/remediationEvent';
import { ExtendedClient } from '../../src/lsp/protocol';
import { IdeLabsFlagManagementService } from '../../src/labs/ideLabsFlagManagementService';

suite('RemediationService Test Suite', () => {
  let remediationService: RemediationService;
  let eventChangeEmitterSpy: sinon.SinonSpy;

  setup(() => {
    // Mock IDE Labs flag to be enabled for these tests
    sinon.stub(IdeLabsFlagManagementService, 'instance').get(() => ({
      isIdeLabsEnabled: () => true,
      isIdeLabsJoined: () => true
    }));

    // Initialize service before each test
    RemediationService.init();
    remediationService = RemediationService.instance;

    // Spy on the event emitter
    eventChangeEmitterSpy = sinon.spy(remediationService['eventChangeEmitter'], 'fire');
  });

  teardown(() => {
    sinon.restore();
    // Clear events after each test
    remediationService.clearEvents();
  });

  suite('Event Tracking', () => {
    test('should track issue event', () => {
      const mockIssue: ExtendedClient.Issue = {
        fileUri: 'file:///test/file.ts',
        message: 'Test issue message',
        ruleKey: 'typescript:S1234',
        textRange: {
          startLine: 1,
          startLineOffset: 0,
          endLine: 1,
          endLineOffset: 10
        }
      } as ExtendedClient.Issue;

      remediationService.trackIssueEvent(mockIssue);

      const events = remediationService.getEvents();
      expect(events).to.have.lengthOf(1);
      expect(events[0].type).to.equal(RemediationEventType.OPEN_ISSUE);
      expect(events[0].message).to.equal('Test issue message');
      expect(events[0].ruleKey).to.equal('typescript:S1234');
      expect(eventChangeEmitterSpy.calledOnce).to.be.true;
    });

    test('should track hotspot event', () => {
      const mockHotspot: ExtendedClient.RemoteHotspot = {
        ideFilePath: 'test/file.ts',
        message: 'Test hotspot message',
        rule: { key: 'typescript:S5678' },
        textRange: {
          startLine: 5,
          startLineOffset: 0,
          endLine: 5,
          endLineOffset: 20
        }
      } as ExtendedClient.RemoteHotspot;

      remediationService.trackHotspotEvent(mockHotspot);

      const events = remediationService.getEvents();
      expect(events).to.have.lengthOf(1);
      expect(events[0].type).to.equal(RemediationEventType.OPEN_HOTSPOT);
      expect(events[0].message).to.equal('Test hotspot message');
      expect(events[0].ruleKey).to.equal('typescript:S5678');
    });

    test('should track fix suggestion event', () => {
      const mockParams: ExtendedClient.ShowFixSuggestionParams = {
        suggestionId: 'fix-123',
        fileUri: 'file:///test/file.ts',
        explanation: 'Fix null pointer dereference',
        textEdits: [],
        isLocal: true
      };

      remediationService.trackFixSuggestionEvent(mockParams);

      const events = remediationService.getEvents();
      expect(events).to.have.lengthOf(1);
      expect(events[0].type).to.equal(RemediationEventType.VIEW_FIX_SUGGESTION);
      expect(events[0].message).to.equal('Fix null pointer dereference');
    });

    test('should generate unique IDs for events', () => {
      const mockIssue: ExtendedClient.Issue = {
        fileUri: 'file:///test/file.ts',
        message: 'Test issue',
        ruleKey: 'test:rule'
      } as ExtendedClient.Issue;

      remediationService.trackIssueEvent(mockIssue);
      remediationService.trackIssueEvent(mockIssue);

      const events = remediationService.getEvents();
      expect(events).to.have.lengthOf(2);
      expect(events[0].id).to.not.equal(events[1].id);
    });
  });

  suite('Clear Events', () => {
    test('should clear all events', () => {
      const mockIssue: ExtendedClient.Issue = {
        fileUri: 'file:///test/file.ts',
        message: 'Test issue',
        ruleKey: 'test:rule'
      } as ExtendedClient.Issue;

      remediationService.trackIssueEvent(mockIssue);
      remediationService.trackIssueEvent(mockIssue);
      expect(remediationService.getEvents()).to.have.lengthOf(2);

      remediationService.clearEvents();

      expect(remediationService.getEvents()).to.have.lengthOf(0);
      expect(eventChangeEmitterSpy.callCount).to.be.greaterThan(0);
    });

    test('should clear viewed state when clearing events', () => {
      const mockIssue: ExtendedClient.Issue = {
        fileUri: 'file:///test/file.ts',
        message: 'Test issue',
        ruleKey: 'test:rule'
      } as ExtendedClient.Issue;

      remediationService.trackIssueEvent(mockIssue);
      const events = remediationService.getEvents();
      const eventId = events[0].id;

      remediationService.markEventAsViewed(eventId);
      expect(remediationService.isEventViewed(eventId)).to.be.true;

      remediationService.clearEvents();

      // After clearing, the viewed state should also be cleared
      expect(remediationService.isEventViewed(eventId)).to.be.false;
    });
  });

  suite('Viewed State Tracking', () => {
    test('should mark event as viewed', () => {
      const mockIssue: ExtendedClient.Issue = {
        fileUri: 'file:///test/file.ts',
        message: 'Test issue',
        ruleKey: 'test:rule'
      } as ExtendedClient.Issue;

      remediationService.trackIssueEvent(mockIssue);
      const events = remediationService.getEvents();
      const eventId = events[0].id;

      expect(remediationService.isEventViewed(eventId)).to.be.false;

      remediationService.markEventAsViewed(eventId);

      expect(remediationService.isEventViewed(eventId)).to.be.true;
      expect(eventChangeEmitterSpy.callCount).to.be.greaterThan(1);
    });

    test('should track multiple viewed events', () => {
      const mockIssue: ExtendedClient.Issue = {
        fileUri: 'file:///test/file.ts',
        message: 'Test issue',
        ruleKey: 'test:rule'
      } as ExtendedClient.Issue;

      remediationService.trackIssueEvent(mockIssue);
      remediationService.trackIssueEvent(mockIssue);
      remediationService.trackIssueEvent(mockIssue);

      const events = remediationService.getEvents();
      expect(events).to.have.lengthOf(3);

      remediationService.markEventAsViewed(events[0].id);
      remediationService.markEventAsViewed(events[2].id);

      expect(remediationService.isEventViewed(events[0].id)).to.be.true;
      expect(remediationService.isEventViewed(events[1].id)).to.be.false;
      expect(remediationService.isEventViewed(events[2].id)).to.be.true;
    });

    test('should return false for non-existent event ID', () => {
      expect(remediationService.isEventViewed('non-existent-id')).to.be.false;
    });

    test('should handle marking same event as viewed multiple times', () => {
      const mockIssue: ExtendedClient.Issue = {
        fileUri: 'file:///test/file.ts',
        message: 'Test issue',
        ruleKey: 'test:rule'
      } as ExtendedClient.Issue;

      remediationService.trackIssueEvent(mockIssue);
      const events = remediationService.getEvents();
      const eventId = events[0].id;

      remediationService.markEventAsViewed(eventId);
      remediationService.markEventAsViewed(eventId);
      remediationService.markEventAsViewed(eventId);

      expect(remediationService.isEventViewed(eventId)).to.be.true;
      // Should still work correctly even after multiple marks
    });
  });

  suite('Event Change Notifications', () => {
    test('should fire event when tracking new event', () => {
      const mockIssue: ExtendedClient.Issue = {
        fileUri: 'file:///test/file.ts',
        message: 'Test issue',
        ruleKey: 'test:rule'
      } as ExtendedClient.Issue;

      eventChangeEmitterSpy.resetHistory();
      remediationService.trackIssueEvent(mockIssue);

      expect(eventChangeEmitterSpy.calledOnce).to.be.true;
      const firedEvents = eventChangeEmitterSpy.firstCall.args[0];
      expect(firedEvents).to.be.an('array');
      expect(firedEvents).to.have.lengthOf(1);
    });

    test('should fire event when marking as viewed', () => {
      const mockIssue: ExtendedClient.Issue = {
        fileUri: 'file:///test/file.ts',
        message: 'Test issue',
        ruleKey: 'test:rule'
      } as ExtendedClient.Issue;

      remediationService.trackIssueEvent(mockIssue);
      const events = remediationService.getEvents();

      eventChangeEmitterSpy.resetHistory();
      remediationService.markEventAsViewed(events[0].id);

      expect(eventChangeEmitterSpy.calledOnce).to.be.true;
    });

    test('should fire event when clearing events', () => {
      const mockIssue: ExtendedClient.Issue = {
        fileUri: 'file:///test/file.ts',
        message: 'Test issue',
        ruleKey: 'test:rule'
      } as ExtendedClient.Issue;

      remediationService.trackIssueEvent(mockIssue);

      eventChangeEmitterSpy.resetHistory();
      remediationService.clearEvents();

      expect(eventChangeEmitterSpy.calledOnce).to.be.true;
      const firedEvents = eventChangeEmitterSpy.firstCall.args[0];
      expect(firedEvents).to.be.an('array');
      expect(firedEvents).to.have.lengthOf(0);
    });
  });

  suite('Batch Clearing', () => {
    test('should automatically clear events after threshold', function() {
      this.timeout(10000); // Increase timeout for this test

      const mockIssue: ExtendedClient.Issue = {
        fileUri: 'file:///test/file.ts',
        message: 'Test issue',
        ruleKey: 'test:rule'
      } as ExtendedClient.Issue;

      remediationService.trackIssueEvent(mockIssue);
      expect(remediationService.getEvents()).to.have.lengthOf(1);

      // Wait for batch threshold (5000ms + buffer)
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Track another event - this should trigger batch clear check
          remediationService.trackIssueEvent(mockIssue);
          const events = remediationService.getEvents();

          // Should only have the new event, old one should be cleared
          expect(events).to.have.lengthOf(1);
          resolve();
        }, 5500);
      });
    });
  });
});
