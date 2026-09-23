/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

const vscode = acquireVsCodeApi();

const loading = document.getElementById('loading');
const content = document.getElementById('content');
const cliStatus = document.getElementById('cli-status');
const cliAction = document.getElementById('cli-action');
const detectedLabel = document.getElementById('detected-label');
const agentList = document.getElementById('agent-list');
const noAgents = document.getElementById('no-agents');
const remoteNotice = document.getElementById('remote-notice');
const hookRow = document.getElementById('hook-row');
const hookStatus = document.getElementById('hook-status');
const hookAction = document.getElementById('hook-action');
const mcpStatus = document.getElementById('mcp-status');
const mcpAgent = document.getElementById('mcp-agent');
const mcpReadiness = document.getElementById('mcp-readiness');
const mcpAction = document.getElementById('mcp-action');
const legacyInstructionsRow = document.getElementById('legacy-instructions-row');

document.addEventListener('DOMContentLoaded', () => vscode.postMessage({ command: 'ready' }));
window.addEventListener('message', event => {
  if (event.origin && !event.origin.startsWith('vscode-webview://')) {
    return;
  }
  if (event.data.command === 'state') {
    render(event.data.state);
  } else if (event.data.command === 'error') {
    content.hidden = true;
    loading.hidden = false;
    loading.textContent = 'Could not load AI integrations. Reload the view to try again.';
  }
});

cliAction.addEventListener('click', () => vscode.postMessage({ command: 'openCliDocumentation' }));
document
  .getElementById('vortex-docs')
  .addEventListener('click', () => vscode.postMessage({ command: 'openVortexDocumentation' }));
document
  .getElementById('mcp-docs')
  .addEventListener('click', () => vscode.postMessage({ command: 'openMcpDocumentation' }));
document
  .getElementById('legacy-instructions-action')
  .addEventListener('click', () => vscode.postMessage({ command: 'openLegacyInstructions' }));

function render(state) {
  loading.hidden = true;
  content.hidden = false;
  remoteNotice.hidden = !state.isRemote;

  renderCli(state);
  renderMcp(state);
}

function renderCli(state) {
  const cliInstalled = state.cli.installationStatus === 'INSTALLED';
  renderCliStatus(state.cli.installationStatus);
  cliAction.textContent = cliInstalled ? 'Learn more about SonarQube CLI' : 'View installation guide';

  agentList.replaceChildren();
  const compatibleAgents = state.agents.filter(agent => agent.supportsCliIntegration);
  for (const agent of compatibleAgents) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    const source = document.createElement('span');
    name.textContent = agent.name;
    source.className = 'agent-source';
    source.textContent = agent.source === 'builtIn' ? 'Built in' : 'Extension';
    item.append(name, source);
    agentList.append(item);
  }
  const hasCompatibleAgents = compatibleAgents.length > 0;
  detectedLabel.hidden = !hasCompatibleAgents;
  agentList.hidden = !hasCompatibleAgents;
  noAgents.hidden = hasCompatibleAgents;
  if (hasCompatibleAgents) {
    detectedLabel.textContent = `CLI-compatible agents detected in ${state.ideName}`;
  } else {
    noAgents.textContent = `No CLI-compatible agents detected in ${state.ideName}.`;
  }

  setVisible(hookRow, state.cli.hook.supported);
  if (state.cli.hook.supported) {
    hookStatus.textContent = state.cli.hook.configured
      ? 'Enabled'
      : 'Runs SonarQube analysis automatically when enabled';
    hookAction.textContent = state.cli.hook.configured ? 'Open configuration' : 'Enable';
    hookAction.disabled = !state.cli.hook.configured && state.isRemote;
    const command = state.cli.hook.configured ? 'openHook' : 'installHook';
    hookAction.onclick = () => vscode.postMessage({ command });
  }
}

function renderCliStatus(installationStatus) {
  if (installationStatus === 'INSTALLED') {
    setStatus(cliStatus, 'Installed', 'configured');
  } else if (installationStatus === 'UNUSABLE') {
    setStatus(cliStatus, 'Unavailable', 'unavailable');
  } else {
    setStatus(cliStatus, 'Not detected', 'notConfigured');
  }
}

function renderMcp(state) {
  let status = 'Unavailable';
  let statusKind = 'unavailable';
  if (state.mcp.supported) {
    status = state.mcp.configured ? 'Configured' : 'Not configured';
    statusKind = state.mcp.configured ? 'configured' : 'notConfigured';
  }
  setStatus(mcpStatus, status, statusKind);

  mcpAgent.textContent = state.mcp.agentName ?? `No supported MCP agent detected in ${state.ideName}`;
  mcpReadiness.textContent = state.mcp.configured ? 'Connection not verified' : '';
  mcpAction.disabled = !state.mcp.supported || (!state.mcp.configured && state.isRemote);
  mcpAction.textContent = state.mcp.configured ? 'Open configuration' : 'Set up MCP';
  mcpAction.onclick = () =>
    vscode.postMessage({
      command: state.mcp.configured ? 'openMcpConfiguration' : 'configureMcp'
    });

  setVisible(legacyInstructionsRow, state.mcp.legacyInstructionsConfigured);
}

function setVisible(element, visible) {
  element.hidden = !visible;
  element.style.display = visible ? '' : 'none';
}

function setStatus(element, label, kind) {
  element.textContent = kind === 'configured' ? `✓ ${label}` : label;
  element.className = `status status-${kind}`;
}
