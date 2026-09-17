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
  } else if (event.data.command === 'setupOutcome') {
    cliFeedback.hidden = false;
    cliFeedback.dataset.running = 'false';
    cliFeedback.textContent = event.data.message;
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
  renderCliFeedback(state.cli.operationInProgress);

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
    action.disabled =
      !cliInstalled ||
      state.cli.authenticationStatus !== 'AUTHENTICATED' ||
      state.isRemote ||
      state.cli.operationInProgress;
    action.addEventListener('click', () => postCliSetup({ command: 'integrateAgent', agent: agent.id }));
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
    setVisible(cliAction, true);
    cliAction.textContent = 'Setup running in terminal…';
    cliAction.disabled = true;
    cliAction.onclick = undefined;
    return;
  }

  let label;
  let command;
  if (state.cli.installationStatus === 'NOT_INSTALLED') {
    label = 'Install SonarQube CLI';
    command = 'installCli';
  } else if (state.cli.installationStatus === 'UNUSABLE') {
    label = 'Open troubleshooting guide';
    command = 'openCliDocumentation';
  } else if (['UNAUTHENTICATED', 'INVALID', 'UNVERIFIED'].includes(state.cli.authenticationStatus)) {
    label = 'Sign in with SonarQube CLI';
    command = 'authenticateCli';
  } else if (state.cli.authenticationStatus !== 'AUTHENTICATED') {
    label = 'Refresh';
    command = 'refresh';
  }

  setVisible(cliAction, command !== undefined);
  if (command === undefined) {
    cliAction.onclick = undefined;
    return;
  }
  cliAction.textContent = label;
  cliAction.disabled = state.isRemote && ['installCli', 'authenticateCli'].includes(command);
  cliAction.onclick = () => {
    if (['installCli', 'authenticateCli'].includes(command)) {
      postCliSetup({ command });
    } else {
      vscode.postMessage({ command });
    }
  };
}

function postCliSetup(message) {
  cliAction.disabled = true;
  agentList.querySelectorAll('button').forEach(button => (button.disabled = true));
  cliFeedback.hidden = false;
  cliFeedback.dataset.running = 'true';
  cliFeedback.textContent = 'Opening the SonarQube CLI terminal…';
  vscode.postMessage(message);
}

function renderCliFeedback(operationInProgress) {
  if (operationInProgress) {
    cliFeedback.hidden = false;
    cliFeedback.dataset.running = 'true';
    cliFeedback.textContent = 'Setup is running in the SonarQube CLI terminal.';
  } else if (cliFeedback.dataset.running === 'true') {
    cliFeedback.hidden = true;
    cliFeedback.dataset.running = 'false';
    cliFeedback.textContent = '';
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
