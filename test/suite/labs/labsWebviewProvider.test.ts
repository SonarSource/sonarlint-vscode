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
import { LabsWebviewProvider } from '../../../src/labs/labsWebviewProvider';
import { IdeLabsFlagManagementService } from '../../../src/labs/ideLabsFlagManagementService';
import { Commands } from '../../../src/util/commands';
import { LabsFeature, LABS_FEATURES } from '../../../src/labs/labsFeatures';

suite('LabsWebviewProvider', () => {
  const TEST_EMAIL = 'test@example.com';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let provider: any;
  let webviewViewStub: Partial<vscode.WebviewView>;
  let postMessageStub: sinon.SinonStub;
  let joinIdeLabsRequestStub: sinon.SinonStub;
  let joinIdeLabsStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;
  let executeCommandStub: sinon.SinonStub;
  let mockLanguageClient: any;

  setup(() => {
    
    // Create an instance without calling the constructor to avoid command registration
    provider = Object.create(LabsWebviewProvider.prototype);
    
    postMessageStub = sinon.stub().resolves();
    webviewViewStub = {
      webview: {
        postMessage: postMessageStub,
        options: {},
        html: '',
        onDidReceiveMessage: sinon.stub()
      } as unknown as vscode.Webview
    };
    
    provider._view = webviewViewStub;
    
    // Create a mock language client and stub its joinIdeLabsProgram method
    mockLanguageClient = {
      joinIdeLabsProgram: sinon.stub(),
      labsFeedbackLinkClicked: sinon.stub(),
      labsExternalLinkClicked: sinon.stub()
    };
    joinIdeLabsRequestStub = mockLanguageClient.joinIdeLabsProgram;
    provider.languageClient = mockLanguageClient;
    
    joinIdeLabsStub = sinon.stub(IdeLabsFlagManagementService.instance, 'joinIdeLabs');
    showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
    executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');
  });

  teardown(() => {
    sinon.restore();
  });
  
  suite('handleSignup', () => {
    test('should post loading message and handle successful signup', async () => {
        joinIdeLabsRequestStub.resolves({ success: true });
        joinIdeLabsStub.resolves();

        await provider.handleSignup(TEST_EMAIL);

        expect(postMessageStub.calledWith({ command: 'signupLoading' }), 
        'Should post signupLoading message to webview').to.be.true;
        expect(joinIdeLabsRequestStub.calledOnceWith(TEST_EMAIL, vscode.env.appName), 
        'Should call joinIdeLabsProgram with email and app name exactly once').to.be.true;
        expect(joinIdeLabsStub.calledOnce, 
        'Should call joinIdeLabs from IdeLabsFlagManagementService exactly once').to.be.true;
        expect(showInformationMessageStub.calledWith('Congratulations! You have joined SonarQube for IDE Labs!'), 
        'Should show congratulations information message').to.be.true;
        expect(postMessageStub.calledWith({ command: 'signupSuccess' }), 
        'Should post signupSuccess message to webview').to.be.true;
    });

    test('should handle signup failure with custom error message', async () => {
        const errorMessage = 'Email already registered';
        joinIdeLabsRequestStub.resolves({ success: false, message: errorMessage });

        await provider.handleSignup(TEST_EMAIL);

        expect(postMessageStub.calledWith({ command: 'signupLoading' }), 
        'Should post signupLoading message to webview').to.be.true;
        expect(joinIdeLabsStub.notCalled, 
        'Should NOT call joinIdeLabs when signup fails').to.be.true;
        expect(showInformationMessageStub.notCalled, 
        'Should NOT show information message when signup fails').to.be.true;
        expect(postMessageStub.calledWith({
        command: 'signupError',
        message: errorMessage
        }), 'Should post signupError message with custom error message to webview').to.be.true;
    });

    test('should handle exception during signup', async () => {
        const errorMessage = 'Network error';
        joinIdeLabsRequestStub.rejects(new Error(errorMessage));

        await provider.handleSignup(TEST_EMAIL);

        expect(postMessageStub.calledWith({ command: 'signupLoading' }), 
        'Should post signupLoading message to webview').to.be.true;
        expect(joinIdeLabsStub.notCalled, 
        'Should NOT call joinIdeLabs when exception is thrown').to.be.true;
        expect(showInformationMessageStub.notCalled, 
        'Should NOT show information message when exception is thrown').to.be.true;
        expect(postMessageStub.calledWith({
        command: 'signupError',
        message: `Failed to join Labs program: ${errorMessage}`
        }), 'Should post signupError message with formatted error message to webview').to.be.true;
    });
  });

  suite('Link handling', () => {
    test('should route help link via Help and Feedback Link command', () => {
      provider.handleOpenHelpLink('getHelp');
      expect(executeCommandStub.calledWith(Commands.TRIGGER_HELP_AND_FEEDBACK_LINK, {
        id: 'getHelp',
        utm: { content: 'ide-labs-signup', term: 'getHelp' }
      }), 
      'Should execute TRIGGER_HELP_AND_FEEDBACK_LINK command with help link').to.be.true;
    });

    test('should open feedback link in browser and record it in telemetry', () => {
      const sampleFeature: LabsFeature = LABS_FEATURES[0];

      provider.handleOpenFeedbackLink(sampleFeature.id);
      expect(mockLanguageClient.labsFeedbackLinkClicked.calledWith(sampleFeature.id), 
      'Should call labsFeedbackLinkClicked with feature id').to.be.true;
      expect(executeCommandStub.calledWith(Commands.OPEN_BROWSER, vscode.Uri.parse(sampleFeature.feedbackUrl)), 
      'Should execute OPEN_BROWSER command with feedback link').to.be.true;
    });

    test('should open learn more link in browser and record it in telemetry', () => {
      const sampleFeature: LabsFeature = LABS_FEATURES[0];

      provider.handleOpenLearnMoreLink(sampleFeature.id);
      expect(mockLanguageClient.labsExternalLinkClicked.calledWith(sampleFeature.id), 
      'Should call labsExternalLinkClicked with feature id').to.be.true;
      expect(executeCommandStub.calledWith(Commands.OPEN_BROWSER, vscode.Uri.parse(sampleFeature.learnMoreUrl)), 
      'Should execute OPEN_BROWSER command with learn more link').to.be.true;
    });
  });
});
