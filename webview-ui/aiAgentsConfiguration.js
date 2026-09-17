/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

const vscode = acquireVsCodeApi();

const loading = document.getElementById('loading');
const loadError = document.getElementById('load-error');
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
const mcpList = document.getElementById('mcp-list');
const noMcpAgents = document.getElementById('no-mcp-agents');
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
    loading.hidden = true;
    loadError.hidden = false;
  }
});

document.getElementById('retry-loading').addEventListener('click', () => {
  loadError.hidden = true;
  loading.hidden = false;
  loading.textContent = 'Loading AI integrations…';
  vscode.postMessage({ command: 'refresh' });
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
  loadError.hidden = true;
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
  if (state.mcp.configurableCount === 0) {
    setStatus(mcpStatus, 'No standalone agents', 'unavailable');
  } else {
    const allConfigured = state.mcp.configuredCount === state.mcp.configurableCount;
    setStatus(
      mcpStatus,
      `${state.mcp.configuredCount} of ${state.mcp.configurableCount} configured`,
      allConfigured ? 'configured' : 'notConfigured'
    );
  }

  mcpList.replaceChildren();
  for (const integration of state.mcp.integrations) {
    mcpList.append(createMcpIntegrationRow(integration, state));
  }
  const hasAgents = state.mcp.integrations.length > 0;
  mcpList.hidden = !hasAgents;
  noMcpAgents.hidden = hasAgents;

  setVisible(legacyInstructionsRow, state.mcp.legacyInstructionsConfigured);
}

function createMcpIntegrationRow(integration, state) {
  const row = document.createElement('li');
  row.className = 'mcp-integration-row';

  const details = document.createElement('div');
  details.className = 'mcp-integration-details';
  const name = document.createElement('span');
  name.textContent = integration.agentName;
  const file = document.createElement('span');
  file.className = 'supporting-text mcp-configuration-path';
  file.textContent = integration.configurationPath ?? 'Standalone configuration is not supported';
  details.append(name, file);

  const stateAndAction = document.createElement('div');
  stateAndAction.className = 'mcp-integration-action';
  const status = document.createElement('span');
  const action = document.createElement('button');
  action.className = 'secondary-action';
  action.type = 'button';
  const needsAttention = ['MALFORMED', 'UNKNOWN'].includes(integration.configurationStatus);
  let setupAction = false;

  if (integration.availableThroughCli) {
    setStatus(status, 'Available through CLI', 'notConfigured');
  } else if (!integration.standaloneSupported) {
    setStatus(status, 'Unavailable', 'unavailable');
  } else if (integration.configurationStatus === 'CLI_MANAGED') {
    setStatus(status, 'Managed by CLI', 'configured');
    configureOpenAction(action, integration.agentId);
  } else if (needsAttention) {
    setStatus(status, 'Needs attention', 'unavailable');
    configureOpenAction(action, integration.agentId);
  } else if (integration.configurationStatus === 'STANDALONE') {
    setStatus(status, 'Configured', 'configured');
    if (integration.requiresSetup && !state.isRemote) {
      action.textContent = 'Set up again';
      configureSetupAction(action, integration.agentId);
      setupAction = true;
    } else {
      configureOpenAction(action, integration.agentId);
    }
  } else {
    setStatus(status, 'Not configured', 'notConfigured');
    action.textContent = 'Set up';
    configureSetupAction(action, integration.agentId);
    setupAction = true;
  }

  const hasAction = action.textContent.length > 0;
  action.hidden = !hasAction;
  action.disabled = hasAction && (state.mcp.operationInProgress || (state.isRemote && setupAction));
  if (integration.operationInProgress) {
    action.textContent = 'Setting up…';
  }
  stateAndAction.append(status, action);
  row.append(details, stateAndAction);

  const diagnostic = getMcpDiagnostic(integration, state.isRemote);
  if (diagnostic) {
    const message = document.createElement('span');
    message.className = 'supporting-text mcp-diagnostic';
    message.textContent = diagnostic;
    row.append(message);
  }
  return row;
}

function getMcpDiagnostic(integration, isRemote) {
  if (integration.configurationStatus === 'CLI_MANAGED') {
    return undefined;
  }
  if (!integration.requiresSetup) {
    return integration.diagnostic;
  }
  return isRemote
    ? 'This configuration has no saved IDE connection. Automatic port updates are unavailable in remote windows.'
    : 'Set up again to select the IDE connection for this agent.';
}

function configureOpenAction(action, agent) {
  action.textContent = 'Open configuration';
  action.addEventListener('click', () => vscode.postMessage({ command: 'openMcpConfiguration', agent }));
}

function configureSetupAction(action, agent) {
  action.addEventListener('click', () => {
    mcpList.querySelectorAll('button').forEach(button => (button.disabled = true));
    action.textContent = 'Setting up…';
    vscode.postMessage({ command: 'configureMcp', agent });
  });
}

function setVisible(element, visible) {
  element.hidden = !visible;
  element.style.display = visible ? '' : 'none';
}

function setStatus(element, label, kind) {
  element.textContent = kind === 'configured' ? `✓ ${label}` : label;
  element.className = `status status-${kind}`;
}
