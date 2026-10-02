/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { AIAgentsConfigurationState } from '../../../src/aiAgentsConfiguration/aiAgentsConfigurationWebviewProvider';
import { AiIntegration } from '../../../src/lsp/aiIntegrationProtocol';

interface RenderedAgent {
  status: string;
  action: string;
  disabled: boolean;
  paths: string[];
  checks: string[];
  expanded?: boolean;
}

async function renderWebview(state: AIAgentsConfigurationState): Promise<{
  agents: RenderedAgent[];
  injectedElement: boolean;
  actions: Array<{ command: string; agent: AiIntegration.AiAgent }>;
}> {
  const root = path.resolve(__dirname, '../../../..');
  const panel = vscode.window.createWebviewPanel('aiIntegrationsTest', 'AI integrations test',
    { viewColumn: vscode.ViewColumn.One, preserveFocus: true },
    { enableScripts: true, localResourceRoots: [vscode.Uri.file(root)] });
  const nonce = randomUUID();
  const probe = `<script nonce="${nonce}">
    window.addEventListener('message', event => {
      if (event.data.command !== 'state') return;
      const agents = Array.from(document.querySelectorAll('#agent-list > li')).map(row => {
        const disclosure = row.querySelector('details');
        disclosure?.querySelector('summary').click();
        row.querySelector('button')?.click();
        return {
          status: row.querySelector('.cli-recording-status')?.textContent,
          action: row.querySelector('button')?.textContent,
          disabled: row.querySelector('button')?.disabled,
          paths: Array.from(row.querySelectorAll('.cli-configuration-path')).map(path => path.textContent),
          checks: Array.from(row.querySelectorAll('.cli-configuration-entry span:not(.cli-configuration-path)'))
            .map(check => check.textContent),
          expanded: disclosure?.open
        };
      });
      vscode.postMessage({ command: 'rendered', agents, injectedElement: Boolean(document.querySelector('img')) });
    });
  </script>`;
  const actions: Array<{ command: string; agent: AiIntegration.AiAgent }> = [];
  let listener: vscode.Disposable;
  try {
    const rendered = new Promise<{ agents: RenderedAgent[]; injectedElement: boolean }>(resolve => {
      listener = panel.webview.onDidReceiveMessage(message => {
        if (message.command === 'ready') {
          void panel.webview.postMessage({ command: 'state', state });
        } else if (message.command === 'integrateAgent') {
          actions.push(message);
        } else if (message.command === 'rendered') {
          resolve(message);
        }
      });
    });
    panel.webview.html = fs.readFileSync(path.join(root, 'webview-ui/aiAgentsConfiguration.html'), 'utf8')
      .replaceAll('{{cspSource}}', panel.webview.cspSource)
      .replace('script-src ' + panel.webview.cspSource, `script-src ${panel.webview.cspSource} 'nonce-${nonce}'`)
      .replace('{{styleSrc}}', panel.webview.asWebviewUri(vscode.Uri.file(path.join(root, 'styles/aiAgentsConfiguration.css'))).toString())
      .replace('{{scriptSrc}}', panel.webview.asWebviewUri(vscode.Uri.file(path.join(root, 'webview-ui/aiAgentsConfiguration.js'))).toString())
      .replace('</body>', probe + '</body>');
    return { ...await rendered, actions };
  } finally {
    listener?.dispose();
    panel.dispose();
  }
}

suite('AI integrations webview rendering', () => {
  function state(canIntegrate: boolean): AIAgentsConfigurationState {
    const agents: AIAgentsConfigurationState['agents'] = [
      {
        id: AiIntegration.AiAgent.CODEX, name: 'Codex', supportsCliIntegration: true, recordingStatus: 'RECORDED',
        configurations: [
          { path: '<img src=x onerror=alert(1)>', mcp: 'INVALID' },
          { path: '<img src=x onerror=alert(1)>', mcp: 'CONFIGURED', hooks: 'NOT_CONFIGURED' },
          { hooks: 'UNKNOWN' }
        ]
      },
      {
        id: AiIntegration.AiAgent.CLAUDE_CODE, name: 'Claude Code', supportsCliIntegration: true,
        recordingStatus: 'NOT_RECORDED', configurations: []
      },
      {
        id: AiIntegration.AiAgent.GITHUB_COPILOT_CLI, name: 'GitHub Copilot CLI', supportsCliIntegration: true,
        recordingStatus: 'UNKNOWN', configurations: []
      }
    ];
    return {
      ideName: 'VS Code', isRemote: false, agents,
      cli: { installationStatus: 'INSTALLED', authenticationStatus: 'AUTHENTICATED', operationInProgress: false, canIntegrate },
      mcp: { integrations: [], configuredCount: 0, configurableCount: 0, operationInProgress: false }
    };
  }

  test('renders recording badges, action labels and reported configuration details safely', async function () {
    this.timeout(15_000);
    const rendered = await renderWebview(state(true));

    expect(rendered.agents.map(agent => agent.status)).to.deep.equal([
      '✓ Integration recorded', 'No integration recorded', 'Unknown'
    ]);
    expect(rendered.agents.map(agent => agent.action)).to.deep.equal([
      'Configure integration', 'Integrate for all projects', 'Integrate for all projects'
    ]);
    expect(rendered.agents[0].paths).to.deep.equal([
      '<img src=x onerror=alert(1)>', '<img src=x onerror=alert(1)>'
    ]);
    expect(rendered.agents[0].checks).to.deep.equal([
      'MCP: Invalid configuration', 'MCP: Configured', 'Hooks: Not configured', 'Hooks: Unknown'
    ]);
    expect(rendered.agents[0].expanded).to.be.true;
    expect(rendered.injectedElement).to.be.false;
    expect(rendered.actions.map(action => action.agent)).to.deep.equal(state(true).agents.map(agent => agent.id));
  });

  test('disables both configure and integrate actions when setup is unavailable', async function () {
    this.timeout(15_000);
    const rendered = await renderWebview(state(false));

    expect(rendered.agents.every(agent => agent.disabled)).to.be.true;
    expect(rendered.actions).to.deep.equal([]);
  });
});
