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
  actionTitle: string;
  disabled: boolean;
  tooltip: string;
  buttons: number;
  additionalDetails: boolean;
}

interface RenderedMcpAgent {
  status: string;
  tooltip: string;
  action: string;
  statusBelowName: boolean;
  pathVisible: boolean;
  diagnostic: string;
}

async function renderWebview(state: AIAgentsConfigurationState): Promise<{
  agents: RenderedAgent[];
  mcpAgents: RenderedMcpAgent[];
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
      document.querySelectorAll('.agent-disclosure').forEach(disclosure => disclosure.open = true);
      const agents = Array.from(document.querySelectorAll('#agent-list > li')).map(row => {
        row.querySelector('.agent-action')?.click();
        return {
          status: row.querySelector('.cli-recording-status')?.textContent,
          action: row.querySelector('.agent-action')?.textContent,
          actionTitle: row.querySelector('.agent-action')?.title,
          disabled: row.querySelector('.agent-action')?.disabled,
          tooltip: row.querySelector('.cli-recording-status')?.title,
          buttons: row.querySelectorAll('button').length,
          additionalDetails: Boolean(row.querySelector('.cli-configuration-toggle, .cli-configuration-details, .cli-feature-checks'))
        };
      });
      const mcpAgents = Array.from(document.querySelectorAll('#mcp-list > li')).map(row => {
        const name = row.querySelector('.mcp-integration-details')?.firstElementChild;
        const status = row.querySelector('.mcp-configuration-status');
        return {
          status: status?.textContent,
          tooltip: status?.title,
          action: row.querySelector('button')?.textContent,
          statusBelowName: status?.previousElementSibling === name
            && status.getBoundingClientRect().top >= name.getBoundingClientRect().bottom,
          pathVisible: Boolean(status?.title && row.textContent.includes(status.title)),
          diagnostic: row.querySelector('.mcp-diagnostic')?.textContent ?? ''
        };
      });
      document.querySelectorAll('#mcp-list button:not([hidden])').forEach(button => button.click());
      vscode.postMessage({ command: 'rendered', agents, mcpAgents, injectedElement: Boolean(document.querySelector('img')) });
    });
  </script>`;
  const actions: Array<{ command: string; agent: AiIntegration.AiAgent }> = [];
  let listener: vscode.Disposable;
  try {
    const rendered = new Promise<{ agents: RenderedAgent[]; mcpAgents: RenderedMcpAgent[]; injectedElement: boolean }>(resolve => {
      listener = panel.webview.onDidReceiveMessage(message => {
        if (message.command === 'ready') {
          void panel.webview.postMessage({ command: 'state', state });
        } else if (['integrateAgent', 'openMcpConfiguration', 'configureMcp'].includes(message.command)) {
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

  test('renders recording status, safe configuration-path hovers and a consistent integrate action', async function () {
    this.timeout(15_000);
    const rendered = await renderWebview(state(true));

    expect(rendered.agents.map(agent => agent.status)).to.deep.equal([
      '✓ Integration recorded', 'No integration recorded', 'Unknown'
    ]);
    expect(rendered.agents.map(agent => agent.action)).to.deep.equal([
      'Integrate', 'Integrate', 'Integrate'
    ]);
    expect(rendered.agents.every(agent => agent.actionTitle === 'Integrate for all projects')).to.be.true;
    expect(rendered.agents[0].tooltip).to.equal(
      '<img src=x onerror=alert(1)>\n<img src=x onerror=alert(1)>\nConfiguration path not reported'
    );
    expect(rendered.agents.slice(1).every(agent => agent.tooltip === '')).to.be.true;
    expect(rendered.agents.every(agent => agent.buttons === 1 && !agent.additionalDetails)).to.be.true;
    expect(rendered.injectedElement).to.be.false;
    expect(rendered.actions.map(action => action.agent)).to.deep.equal(state(true).agents.map(agent => agent.id));
  });

  test('provides a tooltip fallback when a recorded integration has no configuration path', async function () {
    this.timeout(15_000);
    const input = state(true);
    input.agents[0].configurations = [];

    const rendered = await renderWebview(input);

    expect(rendered.agents[0].status).to.equal('✓ Integration recorded');
    expect(rendered.agents[0].tooltip).to.equal('Configuration path not reported');
  });

  test('disables integration actions when setup is unavailable', async function () {
    this.timeout(15_000);
    const rendered = await renderWebview(state(false));

    expect(rendered.agents.every(agent => agent.disabled)).to.be.true;
    expect(rendered.actions).to.deep.equal([]);
  });

  test('places MCP statuses under agent names with safe path hovers and existing actions', async function () {
    this.timeout(15_000);
    const input = state(true);
    input.agents = [];
    input.mcp.integrations = [
      {
        agentId: AiIntegration.AiAgent.CODEX, agentName: 'Codex', standaloneSupported: true,
        availableThroughCli: false, configurationStatus: 'STANDALONE',
        configurationPath: '<img src=x onerror=alert(1)>', operationInProgress: false
      },
      {
        agentId: AiIntegration.AiAgent.CURSOR, agentName: 'Cursor', standaloneSupported: true,
        availableThroughCli: false, configurationStatus: 'CLI_MANAGED', configurationPath: '~/.cursor/mcp.json',
        diagnostic: 'Managed by the CLI', operationInProgress: false
      },
      {
        agentId: AiIntegration.AiAgent.WINDSURF, agentName: 'Windsurf', standaloneSupported: true,
        availableThroughCli: false, configurationStatus: 'MALFORMED', configurationPath: '/project/mcp.json',
        diagnostic: 'Invalid JSON', operationInProgress: false
      },
      {
        agentId: AiIntegration.AiAgent.KIRO, agentName: 'Kiro', standaloneSupported: true,
        availableThroughCli: false, configurationStatus: 'NOT_CONFIGURED', operationInProgress: false
      }
    ];
    input.mcp.configurableCount = input.mcp.integrations.length;
    input.mcp.configuredCount = 2;

    const rendered = await renderWebview(input);

    expect(rendered.mcpAgents.map(agent => agent.status)).to.deep.equal([
      '✓ Configured', '✓ Managed by CLI', 'Needs attention', 'Not configured'
    ]);
    expect(rendered.mcpAgents.map(agent => agent.tooltip)).to.deep.equal([
      '<img src=x onerror=alert(1)>', '~/.cursor/mcp.json', '/project/mcp.json', ''
    ]);
    expect(rendered.mcpAgents.every(agent => agent.statusBelowName && !agent.pathVisible)).to.be.true;
    expect(rendered.mcpAgents.map(agent => agent.action)).to.deep.equal([
      'Open configuration', 'Open configuration', 'Open configuration', 'Set up'
    ]);
    expect(rendered.mcpAgents.map(agent => agent.diagnostic)).to.deep.equal(['', '', 'Invalid JSON', '']);
    expect(rendered.actions).to.deep.equal([
      { command: 'openMcpConfiguration', agent: AiIntegration.AiAgent.CODEX },
      { command: 'openMcpConfiguration', agent: AiIntegration.AiAgent.CURSOR },
      { command: 'openMcpConfiguration', agent: AiIntegration.AiAgent.WINDSURF },
      { command: 'configureMcp', agent: AiIntegration.AiAgent.KIRO }
    ]);
    expect(rendered.injectedElement).to.be.false;
  });
});
