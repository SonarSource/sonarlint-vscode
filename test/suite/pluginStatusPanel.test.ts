/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import {
  ARTIFACT_SOURCE_BY_ORDINAL,
  PLUGIN_STATE_BY_ORDINAL,
  formatSource,
  renderLanguageBadge,
  renderStatus,
  resolveEnumValue
} from '../../src/plugin/pluginStatusPanel';

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

  suite('renderLanguageBadge', () => {
    test('renders known language with correct abbreviation and colors', () => {
      const html = renderLanguageBadge('JavaScript');
      expect(html).to.contain('JS');
      expect(html).to.contain('#F7DF1E');
      expect(html).to.contain('#000');
    });

    test('renders known language with tooltip title', () => {
      const html = renderLanguageBadge('Python');
      expect(html).to.contain('title="Python"');
    });

    test('falls back to first 3 chars for unknown language', () => {
      const html = renderLanguageBadge('UnknownLang');
      expect(html).to.contain('Unk');
      expect(html).to.contain('rgba(128,128,128,0.35)');
    });

    test('escapes HTML special chars in plugin name', () => {
      const html = renderLanguageBadge('<script>alert(1)</script>');
      expect(html).to.not.include('<script>');
      expect(html).to.include('&lt;script&gt;');
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
});
