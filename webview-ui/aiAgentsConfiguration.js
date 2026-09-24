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
const cliAuthentication = document.getElementById('cli-authentication');
const cliFeedback = document.getElementById('cli-feedback');
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

document
  .getElementById('cli-docs')
  .addEventListener('click', () => vscode.postMessage({ command: 'openCliDocumentation' }));
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
  renderCliStatus(state.cli.installationStatus);
  renderCliAuthentication(state.cli);
  renderCliAction(state);
  renderCliFeedback(state.cli);

  agentList.replaceChildren();
  const compatibleAgents = state.agents.filter(agent => agent.supportsCliIntegration);
  for (const agent of compatibleAgents) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    const source = document.createElement('span');
    name.textContent = agent.name;
    source.className = 'agent-source';
    source.textContent = agent.source === 'builtIn' ? 'Built in' : 'Extension';
    const details = document.createElement('div');
    details.className = 'agent-details';
    details.append(name, source);
    const action = document.createElement('button');
    action.className = 'secondary-action agent-action';
    action.type = 'button';
    action.textContent = 'Integrate for all projects';
    action.disabled = !state.cli.canIntegrate;
    action.addEventListener('click', () => vscode.postMessage({ command: 'integrateAgent', agent: agent.id }));
    item.append(details, action);
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

function renderCliAuthentication(cli) {
  if (cli.installationStatus === 'NOT_INSTALLED') {
    cliAuthentication.hidden = true;
    cliAuthentication.textContent = '';
    return;
  }

  cliAuthentication.hidden = false;
  if (cli.installationStatus === 'UNUSABLE') {
    cliAuthentication.textContent = 'The detected CLI installation could not be used.';
  } else if (cli.authenticationStatus === 'AUTHENTICATED') {
    const connection = cli.organization ?? cli.serverUrl;
    cliAuthentication.textContent = connection ? `Authenticated with ${connection}` : 'CLI authentication detected.';
  } else if (cli.authenticationStatus === 'UNAUTHENTICATED') {
    cliAuthentication.textContent = 'Sign in to continue with agent integration.';
  } else if (cli.authenticationStatus === 'INVALID') {
    cliAuthentication.textContent = 'CLI authentication is invalid. Sign in again to continue.';
  } else if (cli.authenticationStatus === 'UNVERIFIED') {
    cliAuthentication.textContent = 'CLI authentication could not be verified. Sign in again or refresh.';
  } else if (cli.authenticationStatus === 'UNAVAILABLE') {
    cliAuthentication.textContent = 'Authentication verification is unavailable. Refresh to try again.';
  } else {
    cliAuthentication.textContent = 'CLI authentication could not be verified. Refresh to try again.';
  }
}

function renderCliAction(state) {
  if (state.cli.operationInProgress) {
    setVisible(cliAction, false);
    cliAction.onclick = undefined;
    return;
  }

  const action = state.cli.primaryAction;
  setVisible(cliAction, Boolean(action));
  if (!action) {
    cliAction.onclick = undefined;
    return;
  }
  cliAction.textContent = action.label;
  cliAction.disabled = false;
  cliAction.onclick = () => vscode.postMessage({ command: action.command });
}

function renderCliFeedback(cli) {
  const message = cli.operationInProgress ? 'Setup is running in the SonarQube CLI terminal.' : cli.notice?.message;
  cliFeedback.hidden = !message;
  cliFeedback.textContent = message ?? '';
}

function renderMcp(state) {
  const action = state.mcp.primaryAction;
  setStatus(mcpStatus, state.mcp.statusLabel, state.mcp.statusKind);
  mcpAgent.textContent = state.mcp.agentName ?? `No supported MCP agent detected in ${state.ideName}`;
  mcpReadiness.textContent = state.mcp.readiness;
  mcpAction.disabled = action.disabled;
  mcpAction.textContent = action.label;
  mcpAction.onclick = action.disabled
    ? undefined
    : () => vscode.postMessage({ command: action.command });

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
