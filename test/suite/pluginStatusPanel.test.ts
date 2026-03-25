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
import {
  ARTIFACT_SOURCE_BY_ORDINAL,
  PLUGIN_STATE_BY_ORDINAL,
  PluginStatusPanel,
  formatSource,
  renderStatus,
  resolveEnumValue
} from '../../src/plugin/pluginStatusPanel';
import { SETUP_TEARDOWN_HOOK_TIMEOUT } from './commons';

suite('pluginStatusPanel', () => {

  suite('resolveEnumValue', () => {
    test('resolves ordinal number to enum name', () => {
      expect(resolveEnumValue(0, PLUGIN_STATE_BY_ORDINAL)).to.equal('ACTIVE');
      expect(resolveEnumValue(1, PLUGIN_STATE_BY_ORDINAL)).to.equal('SYNCED');
      expect(resolveEnumValue(2, PLUGIN_STATE_BY_ORDINAL)).to.equal('DOWNLOADING');
      expect(resolveEnumValue(3, PLUGIN_STATE_BY_ORDINAL)).to.equal('FAILED');
      expect(resolveEnumValue(4, PLUGIN_STATE_BY_ORDINAL)).to.equal('PREMIUM');
      expect(resolveEnumValue(5, PLUGIN_STATE_BY_ORDINAL)).to.equal('UNSUPPORTED');
    });

    test('resolves ordinal number to artifact source name', () => {
      expect(resolveEnumValue(0, ARTIFACT_SOURCE_BY_ORDINAL)).to.equal('EMBEDDED');
      expect(resolveEnumValue(1, ARTIFACT_SOURCE_BY_ORDINAL)).to.equal('ON_DEMAND');
      expect(resolveEnumValue(2, ARTIFACT_SOURCE_BY_ORDINAL)).to.equal('SONARQUBE_SERVER');
      expect(resolveEnumValue(3, ARTIFACT_SOURCE_BY_ORDINAL)).to.equal('SONARQUBE_CLOUD');
    });

    test('passes through string values unchanged', () => {
      expect(resolveEnumValue('ACTIVE', PLUGIN_STATE_BY_ORDINAL)).to.equal('ACTIVE');
      expect(resolveEnumValue('EMBEDDED', ARTIFACT_SOURCE_BY_ORDINAL)).to.equal('EMBEDDED');
    });

    test('falls back to string representation for unknown ordinal', () => {
      expect(resolveEnumValue(99, PLUGIN_STATE_BY_ORDINAL)).to.equal('99');
    });

    test('returns empty string for null or undefined', () => {
      expect(resolveEnumValue(null, PLUGIN_STATE_BY_ORDINAL)).to.equal('');
      expect(resolveEnumValue(undefined, PLUGIN_STATE_BY_ORDINAL)).to.equal('');
    });
  });

  suite('renderStatus', () => {
    test('renders Active with green dot', () => {
      const html = renderStatus('ACTIVE');
      expect(html).to.contain('status-active');
      expect(html).to.contain('Active');
      expect(html).to.contain('status-dot');
    });

    test('renders Failed with red dot', () => {
      const html = renderStatus('FAILED');
      expect(html).to.contain('status-failed');
      expect(html).to.contain('Failed');
      expect(html).to.contain('status-dot');
    });

    test('renders Downloading with orange dot', () => {
      const html = renderStatus('DOWNLOADING');
      expect(html).to.contain('status-downloading');
      expect(html).to.contain('Downloading...');
    });

    test('renders Synced with green dot', () => {
      const html = renderStatus('SYNCED');
      expect(html).to.contain('status-synced');
      expect(html).to.contain('Synced');
    });

    test('renders unknown state as plain text', () => {
      const html = renderStatus('SOME_NEW_STATE');
      expect(html).to.contain('SOME_NEW_STATE');
      expect(html).not.to.contain('status-active');
      expect(html).not.to.contain('status-dot');
    });
  });

  suite('formatSource', () => {
    test('formats EMBEDDED source as SonarQube for VS Code with extension version', () => {
      expect(formatSource('EMBEDDED')).to.match(/^SonarQube for VS Code \d+\.\d+/);
    });

    test('formats ON_DEMAND source as SonarQube for VS Code with extension version', () => {
      expect(formatSource('ON_DEMAND')).to.match(/^SonarQube for VS Code \d+\.\d+/);
    });

    test('formats SONARQUBE_SERVER source without version when serverVersion is absent', () => {
      expect(formatSource('SONARQUBE_SERVER')).to.equal('SonarQube Server');
    });

    test('formats SONARQUBE_SERVER source with version when serverVersion is provided', () => {
      expect(formatSource('SONARQUBE_SERVER', '10.8.1')).to.equal('SonarQube Server 10.8.1');
    });

    test('formats SONARQUBE_CLOUD source', () => {
      expect(formatSource('SONARQUBE_CLOUD')).to.equal('SonarQube Cloud');
    });

    test('formats unknown source as raw value', () => {
      expect(formatSource('UNKNOWN_SOURCE')).to.equal('UNKNOWN_SOURCE');
    });
  });

  suite('telemetry', () => {
    let mockLanguageClient: any;
    let isIdeLabsEnabledStub: sinon.SinonStub;

    setup(function () {
      this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
      mockLanguageClient = {
        supportedLanguagesPanelOpened: sinon.stub(),
        supportedLanguagesPanelCtaClicked: sinon.stub(),
        getPluginStatuses: sinon.stub().resolves({ pluginStatuses: [] })
      };
      isIdeLabsEnabledStub = sinon.stub(IdeLabsFlagManagementService.instance, 'isIdeLabsEnabled');
    });

    teardown(() => {
      sinon.restore();
      (PluginStatusPanel as any).instance = undefined;
    });

    test('supportedLanguagesPanelOpened is sent when the panel is shown', async () => {
      isIdeLabsEnabledStub.returns(true);

      const fakeInstance = Object.create(PluginStatusPanel.prototype);
      fakeInstance.fetchAndShow = sinon.stub().resolves();
      (PluginStatusPanel as any).instance = fakeInstance;

      const fakeContext = {} as vscode.ExtensionContext;
      await PluginStatusPanel.showSupportedLanguages(fakeContext, mockLanguageClient);

      expect(
        mockLanguageClient.supportedLanguagesPanelOpened.calledOnce,
        'supportedLanguagesPanelOpened should be called once when the panel is shown'
      ).to.be.true;
    });

    test('supportedLanguagesPanelOpened is not sent when IDE Labs is disabled', async () => {
      isIdeLabsEnabledStub.returns(false);

      const fakeContext = {} as vscode.ExtensionContext;
      await PluginStatusPanel.showSupportedLanguages(fakeContext, mockLanguageClient);

      expect(
        mockLanguageClient.supportedLanguagesPanelOpened.notCalled,
        'supportedLanguagesPanelOpened should not be called when IDE Labs is disabled'
      ).to.be.true;
    });

    test('supportedLanguagesPanelCtaClicked is sent when the setup connection button is clicked', () => {
      const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');

      const panelInstance = Object.create(PluginStatusPanel.prototype);
      panelInstance.languageClient = mockLanguageClient;

      (panelInstance as any).handleMessage({ command: 'setupConnection' });

      expect(
        mockLanguageClient.supportedLanguagesPanelCtaClicked.calledOnce,
        'supportedLanguagesPanelCtaClicked should be called once when setup connection is clicked'
      ).to.be.true;
      expect(executeCommandStub.called, 'A VS Code command should be executed after the telemetry call').to.be.true;
    });
  });

});
