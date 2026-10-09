/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import {
  getActiveMcpAgent,
  getMCPConfigPath,
  configureMCPServer,
  isMCPSetupInProgress,
  onEmbeddedServerStarted,
  openMCPServerConfigurationFile,
  scheduleCopilotActivationMcpRefresh
} from '../../../src/aiAgentsConfiguration/mcpServerConfig';
import { IntegrationTarget } from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import * as aiAgentUtils from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import { AllConnectionsTreeDataProvider, Connection } from '../../../src/connected/connections';
import { ConnectionSettingsService } from '../../../src/settings/connectionsettings';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';
import { Commands } from '../../../src/util/commands';
import { AiIntegration } from '../../../src/lsp/aiIntegrationProtocol';
import { DEFAULT_CONNECTION_ID } from '../../../src/commons';
import * as logging from '../../../src/util/logging';
import * as util from '../../../src/util/util';
import { getRemoteMcpConfigUri, openRemoteMcpConfiguration } from '../../../src/aiAgentsConfiguration/remoteMcpConfiguration';

suite('MCP configuration paths', () => {
  test('should return different config paths for different IDEs', () => {
    const envStub = sinon.stub(vscode.env, 'appName');
    const extensionsStub = sinon.stub(vscode.extensions, 'getExtension');

    try {
      envStub.value('Cursor');
      const cursorPath = getMCPConfigPath(IntegrationTarget.CURSOR);

      envStub.value('Windsurf');
      const windsurfPath = getMCPConfigPath(IntegrationTarget.WINDSURF);

      envStub.value('Kiro');
      const kiroPath = getMCPConfigPath(IntegrationTarget.KIRO);

      envStub.value('Visual Studio Code');
      extensionsStub.withArgs('github.copilot-chat').returns({ isActive: true });
      const vscodePath = getMCPConfigPath(IntegrationTarget.GITHUB_COPILOT);

      expect(cursorPath).to.not.equal(windsurfPath);
      expect(cursorPath).to.not.equal(kiroPath);
      expect(cursorPath).to.not.equal(vscodePath);
      expect(windsurfPath).to.not.equal(kiroPath);
      expect(windsurfPath).to.not.equal(vscodePath);
      expect(kiroPath).to.not.equal(vscodePath);

      expect(cursorPath).to.include('.cursor');
      expect(windsurfPath).to.include('windsurf');
      expect(kiroPath).to.include('.kiro');
      expect(vscodePath).to.include('Code');

      expect(cursorPath).to.match(/mcp\.json$/);
      expect(windsurfPath).to.match(/mcp_config\.json$/);
      expect(kiroPath).to.match(/mcp\.json$/);
      expect(vscodePath).to.match(/mcp\.json$/);
    } finally {
      envStub.restore();
      extensionsStub.restore();
    }
  });

  test('does not infer the remote Copilot configuration from shared global storage', () => {
    sinon.stub(vscode.env, 'remoteName').value('dev-container');
    sinon.stub(util, 'extensionContext').value({
      globalStorageUri: vscode.Uri.file('/home/vscode/.vscode-server/data/User/globalStorage/sonarsource.sonarlint-vscode')
    });
    try {
      expect(getMCPConfigPath(IntegrationTarget.GITHUB_COPILOT)).to.be.undefined;
      expect(getMCPConfigPath(IntegrationTarget.CURSOR)).to.equal(path.join(os.homedir(), '.cursor', 'mcp.json'));
    } finally {
      sinon.restore();
    }
  });

  test('keeps the Windsurf Next MCP configuration separate from Windsurf', () => {
    const envStub = sinon.stub(vscode.env, 'appName');
    try {
      envStub.value('Windsurf');
      expect(getMCPConfigPath(IntegrationTarget.WINDSURF)).to.match(/windsurf[/\\]mcp_config\.json$/);
      envStub.value('Windsurf Next');
      expect(getMCPConfigPath(IntegrationTarget.WINDSURF)).to.match(/windsurf-next[/\\]mcp_config\.json$/);
    } finally {
      envStub.restore();
    }
  });

  test('should throw error for unsupported agent', () => {
    const envStub = sinon.stub(vscode.env, 'appName');
    const extensionsStub = sinon.stub(vscode.extensions, 'getExtension');

    try {
      envStub.value('Unsupported agent');
      extensionsStub.withArgs('github.copilot-chat').returns(undefined);

      expect(() => getMCPConfigPath(AiIntegration.AiAgent.CODEX)).to.throw(
        'MCP setup through a configuration file is not supported'
      );
    } finally {
      envStub.restore();
      extensionsStub.restore();
    }
  });
});

suite('Remote MCP profile selection', () => {
  let context: sinon.SinonStub;
  let commands: sinon.SinonStub;
  let activeEditor: sinon.SinonStub;
  let editorChanged: (editor: vscode.TextEditor) => void;
  let dispose: sinon.SinonSpy;

  setup(() => {
    sinon.stub(vscode.env, 'remoteName').value('dev-container');
    context = sinon.stub(util, 'extensionContext').value({});
    commands = sinon.stub(vscode.commands, 'executeCommand').resolves();
    activeEditor = sinon.stub(vscode.window, 'activeTextEditor').value(undefined);
    dispose = sinon.spy();
    sinon.stub(vscode.window, 'onDidChangeActiveTextEditor').callsFake(listener => {
      editorChanged = listener;
      return { dispose };
    });
  });

  teardown(() => sinon.restore());

  function editor(uri: vscode.Uri, isDirty = false): vscode.TextEditor {
    return { document: { uri, isDirty } } as vscode.TextEditor;
  }

  test('uses VS Code to select default and named remote profile configurations', async () => {
    for (const relativePath of ['mcp.json', 'profiles/review-profile/mcp.json']) {
      const uri = vscode.Uri.parse(`vscode-remote://dev-container+test/home/vscode/.vscode-server/data/User/${relativePath}`);
      commands.callsFake(async () => editorChanged(editor(uri)));

      expect(await openRemoteMcpConfiguration()).to.equal(uri);
      expect(getMCPConfigPath(IntegrationTarget.GITHUB_COPILOT)).to.equal(uri.fsPath);
    }
    expect(commands.alwaysCalledWithExactly('workbench.mcp.openRemoteUserMcpJson')).to.be.true;
    expect(dispose.callCount).to.equal(2);
  });

  test('can resolve an MCP configuration that is already the active editor', async () => {
    const uri = vscode.Uri.file('/remote/User/profiles/test/mcp.json');
    activeEditor.value(editor(uri));

    expect(await openRemoteMcpConfiguration()).to.equal(uri);
    context.value({});
    expect(getRemoteMcpConfigUri()).to.be.undefined;
  });

  test('rejects unresolved and unsaved documents without retaining an earlier URI', async () => {
    const uri = vscode.Uri.file('/remote/User/profiles/test/mcp.json');
    activeEditor.value(editor(uri));
    await openRemoteMcpConfiguration();

    for (const invalidEditor of [undefined, editor(vscode.Uri.file('/remote/settings.json')), editor(uri, true)]) {
      activeEditor.value(invalidEditor);
      let failure: Error;
      try {
        await openRemoteMcpConfiguration();
      } catch (error) {
        failure = error;
      }
      expect(failure).to.be.instanceOf(Error);
      expect(getRemoteMcpConfigUri()).to.be.undefined;
    }
    expect(dispose.callCount).to.equal(4);
  });

  test('propagates command failures and disposes the editor listener', async () => {
    commands.rejects(new Error('command unavailable'));
    let failure: Error;
    try {
      await openRemoteMcpConfiguration();
    } catch (error) {
      failure = error;
    }
    expect(failure.message).to.equal('command unavailable');
    expect(getRemoteMcpConfigUri()).to.be.undefined;
    expect(dispose.calledOnce).to.be.true;
  });
});

suite('MCP configuration workflow', () => {
  const agent = AiIntegration.AiAgent.CURSOR;
  const connection = new Connection('test-connection', 'Test SonarQube', 'sonarqubeConnection', 'ok');
  const original =
    '{"mcpServers":{"sonarqube":{"command":"docker","args":["sonarsource/sonarqube-mcp"],"env":{"SONARQUBE_IDE_PORT":"64120"}}}}';
  const updated = original.replace('64120', '64121');
  let client: SonarLintExtendedLanguageClient;
  let connections: AllConnectionsTreeDataProvider;
  let discover: sinon.SinonStub;
  let inspect: sinon.SinonStub;
  let generate: sinon.SinonStub;
  let plan: sinon.SinonStub;
  let read: sinon.SinonStub;
  let exists: sinon.SinonStub;
  let write: sinon.SinonStub;
  let token: sinon.SinonStub;
  let getConnections: sinon.SinonStub;
  let information: sinon.SinonStub;
  let warning: sinon.SinonStub;
  let error: sinon.SinonStub;
  let commands: sinon.SinonStub;
  let log: sinon.SinonStub;
  let remoteName: sinon.SinonStub;

  setup(() => {
    sinon.stub(vscode.env, 'appName').value('Cursor');
    remoteName = sinon.stub(vscode.env, 'remoteName').value(undefined);
    discover = sinon.stub().resolves({
      agents: [
        {
          agent,
          detectionSources: [AiIntegration.AiAgentDetectionSource.IDE],
          standaloneMcpSupported: true,
          cliIntegrationSupported: true
        }
      ]
    });
    inspect = sinon
      .stub()
      .resolves({ state: AiIntegration.McpConfigurationState.NOT_CONFIGURED, diagnostics: [] });
    generate = sinon
      .stub()
      .resolves({ jsonConfiguration: '{"command":"docker","env":{"SONARQUBE_IDE_PORT":"64121"}}' });
    plan = sinon
      .stub()
      .resolves({
        state: AiIntegration.McpConfigurationState.NOT_CONFIGURED,
        updatedContent: updated,
        diagnostics: []
      });
    client = {
      getAiIntegrationState: discover,
      inspectMcpConfiguration: inspect,
      getMCPServerConfiguration: generate,
      planMcpConfigurationUpdate: plan
    } as unknown as SonarLintExtendedLanguageClient;
    getConnections = sinon.stub().resolves([connection]);
    connections = { getConnections } as unknown as AllConnectionsTreeDataProvider;
    exists = sinon.stub(require('node:fs'), 'existsSync').returns(false);
    read = sinon.stub(require('node:fs'), 'readFileSync');
    write = sinon.stub(require('node:fs'), 'writeFileSync');
    sinon.stub(require('node:fs'), 'mkdirSync');
    token = sinon.stub(ConnectionSettingsService.instance, 'getTokenForConnection').resolves('test-token');
    information = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    warning = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    error = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    commands = sinon.stub(vscode.commands, 'executeCommand').resolves();
    log = sinon.stub(logging, 'logToSonarLintOutput');
  });

  teardown(() => sinon.restore());

  function standalone(): void {
    exists.returns(true);
    read.returns(original);
    inspect.resolves({ state: AiIntegration.McpConfigurationState.STANDALONE, diagnostics: [] });
    plan.resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      updatedContent: updated,
      diagnostics: []
    });
  }

  test('creates a new entry with the selected connection and token', async () => {
    const outcome = await configureMCPServer(client, connections, agent, connection);
    expect(outcome).to.deep.equal({ status: AiIntegration.AiIntegrationActionStatus.SUCCEEDED, agent });
    expect(generate.calledOnceWithExactly('test-connection', 'test-token')).to.be.true;
    expect(plan.firstCall.args[0].content).to.be.null;
    expect(plan.firstCall.args[0].sonarMcpConfiguration).to.equal(
      (await generate.firstCall.returnValue).jsonConfiguration
    );
    expect(write.calledOnce).to.be.true;
    expect(information.firstCall.args[0]).to.include('with "Test SonarQube"');
    expect(commands.calledWith(Commands.REFRESH_AI_AGENTS_CONFIGURATION)).to.be.true;
  });

  test('normalizes the default connection ID on creation', async () => {
    await configureMCPServer(
      client,
      connections,
      agent,
      new Connection(undefined, 'Default', 'sonarqubeConnection', 'ok')
    );
    expect(generate.calledOnceWithExactly(DEFAULT_CONNECTION_ID, 'test-token')).to.be.true;
  });

  test('re-reads the file after user interaction before planning creation', async () => {
    exists.returns(true);
    read.onFirstCall().returns('{"other":true}');
    read.returns('{"other":false}');
    await configureMCPServer(client, connections, agent, connection);
    expect(plan.firstCall.args[0].content).to.equal('{"other":false}');
    expect(write.calledOnce).to.be.true;
  });

  test('reports failure when a concurrent edit prevents replacement', async () => {
    exists.onCall(2).returns(true);
    read.returns('{"external":true}');
    const outcome = await configureMCPServer(client, connections, agent, connection);
    expect(outcome.status).to.equal(AiIntegration.AiIntegrationActionStatus.FAILED);
    expect(error.firstCall.args[0]).to.include('changed while preparing');
    expect(write.called).to.be.false;
    expect(information.called).to.be.false;
  });

  test('reports a failed file write', async () => {
    write.throws(new Error('permission denied'));
    const outcome = await configureMCPServer(client, connections, agent, connection);
    expect(outcome.status).to.equal(AiIntegration.AiIntegrationActionStatus.FAILED);
    expect(error.firstCall.args[0]).to.include('permission denied');
  });

  test('reports cancellation when the user declines creation without a token', async () => {
    token.resolves(undefined);
    const outcome = await configureMCPServer(client, connections, agent, connection);
    expect(outcome.status).to.equal(AiIntegration.AiIntegrationActionStatus.CANCELLED);
    expect(plan.called).to.be.false;
    expect(write.called).to.be.false;
  });

  test('can create an entry after the user explicitly proceeds without a token', async () => {
    token.resolves(undefined);
    warning.resolves('Proceed Anyway');
    const outcome = await configureMCPServer(client, connections, agent, connection);
    expect(outcome.status).to.equal(AiIntegration.AiIntegrationActionStatus.SUCCEEDED);
    expect(generate.calledOnceWithExactly('test-connection', '')).to.be.true;
  });

  test('reports unavailable connections and cancelled connection selection', async () => {
    getConnections.resolves([]);
    expect((await configureMCPServer(client, connections, agent)).status).to.equal(
      AiIntegration.AiIntegrationActionStatus.FAILED
    );
    getConnections.resolves([connection]);
    sinon.stub(vscode.window, 'showQuickPick').resolves(undefined);
    expect((await configureMCPServer(client, connections, agent)).status).to.equal(
      AiIntegration.AiIntegrationActionStatus.CANCELLED
    );
    expect(plan.called).to.be.false;
  });

  test('does not plan malformed, CLI-managed, or unknown entries', async () => {
    for (const state of [
      AiIntegration.McpConfigurationState.MALFORMED,
      AiIntegration.McpConfigurationState.CLI_MANAGED,
      AiIntegration.McpConfigurationState.UNKNOWN
    ]) {
      inspect.resolves({ state, diagnostics: ['Cannot update'] });
      expect((await configureMCPServer(client, connections, agent, connection)).status).to.equal(
        AiIntegration.AiIntegrationActionStatus.FAILED
      );
    }
    expect(plan.called).to.be.false;
    expect(token.called).to.be.false;
    expect(write.called).to.be.false;
  });

  test('refuses a blocked update plan', async () => {
    plan.resolves({
      state: AiIntegration.McpConfigurationState.CLI_MANAGED,
      updatedContent: null,
      diagnostics: ['Cannot update']
    });
    expect((await configureMCPServer(client, connections, agent, connection)).status).to.equal(
      AiIntegration.AiIntegrationActionStatus.FAILED
    );
    expect(write.called).to.be.false;
  });

  test('reports a missing IDE port without looking up connection credentials', async () => {
    await onEmbeddedServerStarted(client, 0);
    standalone();
    const outcome = await configureMCPServer(client, connections, agent, connection);
    expect(outcome.status).to.equal(AiIntegration.AiIntegrationActionStatus.FAILED);
    expect(error.firstCall.args[0]).to.include('IDE connection is unavailable');
    expect(token.called).to.be.false;
    expect(generate.called).to.be.false;
    expect(write.called).to.be.false;
  });

  test('leaves a standalone configuration without an IDE port untouched at startup', async () => {
    standalone();
    plan.resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      updatedContent: null,
      diagnostics: ['The existing SonarQube MCP configuration has no SONARQUBE_IDE_PORT.']
    });

    await onEmbeddedServerStarted(client, 64121);

    expect(inspect.called).to.be.true;
    expect(plan.calledOnce).to.be.true;
    expect(write.called).to.be.false;
  });

  test('explains why manual setup cannot update a standalone entry without an IDE port', async () => {
    await onEmbeddedServerStarted(client, 64121);
    standalone();
    plan.resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      updatedContent: null,
      diagnostics: ['The existing SonarQube MCP configuration has no SONARQUBE_IDE_PORT.']
    });

    const outcome = await configureMCPServer(client, connections, agent);

    expect(outcome.status).to.equal(AiIntegration.AiIntegrationActionStatus.FAILED);
    expect(warning.calledWith('The existing SonarQube MCP configuration has no SONARQUBE_IDE_PORT.')).to.be.true;
    expect(write.called).to.be.false;
  });

  test('refreshes startup ports without connections, tokens, or generation', async () => {
    standalone();
    const storedToken = sinon
      .stub(ConnectionSettingsService.instance, 'getServerToken')
      .throws(new Error('Must not access credentials'));
    await onEmbeddedServerStarted(client, 64121);
    expect(plan.firstCall.args[0]).to.deep.equal({
      agent,
      content: original,
      sonarMcpConfiguration: '{"env":{"SONARQUBE_IDE_PORT":"64121"}}'
    });
    expect(write.calledOnce).to.be.true;
    expect(token.called || storedToken.called || generate.called || getConnections.called).to.be.false;
    expect(commands.calledWith(Commands.REFRESH_AI_AGENTS_CONFIGURATION)).to.be.true;
  });

  test('manual setup of an existing entry refreshes only the IDE port and gives accurate feedback', async () => {
    await onEmbeddedServerStarted(client, 64121);
    standalone();
    plan.resetHistory();
    const outcome = await configureMCPServer(client, connections, agent, connection);
    expect(outcome.status).to.equal(AiIntegration.AiIntegrationActionStatus.SUCCEEDED);
    expect(JSON.parse(plan.firstCall.args[0].sonarMcpConfiguration)).to.deep.equal({
      env: { SONARQUBE_IDE_PORT: '64121' }
    });
    expect(token.called || generate.called || getConnections.called).to.be.false;
    expect(information.firstCall.args[0]).to.equal(
      'SonarQube MCP IDE port updated for Cursor. Your server settings were preserved.'
    );
  });

  test('skips writing identical plans', async () => {
    await onEmbeddedServerStarted(client, 64121);
    standalone();
    plan.resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      updatedContent: original,
      diagnostics: []
    });
    const outcome = await configureMCPServer(client, connections, agent);
    expect(outcome.status).to.equal(AiIntegration.AiIntegrationActionStatus.SUCCEEDED);
    expect(write.called).to.be.false;
    expect(information.firstCall.args[0]).to.equal('SonarQube MCP IDE port is already up to date for Cursor.');
  });

  test('skips absent and non-standalone files at startup', async () => {
    await onEmbeddedServerStarted(client, 64121);
    expect(inspect.called).to.be.false;
    exists.returns(true);
    read.returns('{}');
    for (const state of [
      AiIntegration.McpConfigurationState.NOT_CONFIGURED,
      AiIntegration.McpConfigurationState.CLI_MANAGED,
      AiIntegration.McpConfigurationState.UNKNOWN,
      AiIntegration.McpConfigurationState.MALFORMED
    ]) {
      inspect.resolves({ state, diagnostics: [] });
      await onEmbeddedServerStarted(client, 64121);
    }
    expect(plan.called).to.be.false;
    expect(write.called).to.be.false;
  });

  test('ignores invalid notification ports', async () => {
    for (const port of [0, -1, 65536, 1.2, Number.NaN]) {
      await onEmbeddedServerStarted(client, port);
    }
    expect(discover.called).to.be.false;
    expect(plan.called).to.be.false;
  });

  test('logs startup discovery failures and clears the operation lock', async () => {
    discover.rejects(new Error('discovery failed'));
    await onEmbeddedServerStarted(client, 64121);
    expect(log.firstCall.args[0]).to.include('discovery failed');
    expect(isMCPSetupInProgress()).to.be.false;
  });

  test('rejects manual setup while a startup refresh is running', async () => {
    let release: (state: unknown) => void;
    discover.returns(new Promise(resolve => (release = resolve)));
    const startup = onEmbeddedServerStarted(client, 64121);
    const outcome = await configureMCPServer(client, connections, agent, connection);
    release({ agents: [] });
    await startup;
    expect(outcome.status).to.equal(AiIntegration.AiIntegrationActionStatus.CANCELLED);
    expect(information.firstCall.args[0]).to.include('already running');
  });

  test('defers startup notifications during setup and uses the newest port', async () => {
    let release: (value: string) => void;
    let requested: () => void;
    const request = new Promise<void>(resolve => (requested = resolve));
    token.callsFake(() => {
      requested();
      return new Promise(resolve => (release = resolve));
    });
    const setup = configureMCPServer(client, connections, agent, connection);
    await request;
    await onEmbeddedServerStarted(client, 64122);
    await onEmbeddedServerStarted(client, 64123);
    standalone();
    release('token');
    await setup;
    expect(plan.lastCall.args[0].sonarMcpConfiguration).to.equal('{"env":{"SONARQUBE_IDE_PORT":"64123"}}');
    expect(isMCPSetupInProgress()).to.be.false;
  });

  test('repeats an active startup pass with the newest port', async () => {
    standalone();
    let release: (result: unknown) => void;
    let requested: () => void;
    const request = new Promise<void>(resolve => (requested = resolve));
    plan.onFirstCall().callsFake(() => {
      requested();
      return new Promise(resolve => (release = resolve));
    });
    const first = onEmbeddedServerStarted(client, 64122);
    await request;
    const second = onEmbeddedServerStarted(client, 64124);
    release({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      updatedContent: original,
      diagnostics: []
    });
    await Promise.all([first, second]);
    expect(
      plan.getCalls().map(call => JSON.parse(call.args[0].sonarMcpConfiguration).env.SONARQUBE_IDE_PORT)
    ).to.deep.equal(['64122', '64124']);
  });

  test('records the chosen agent while setup is running and clears it afterwards', async () => {
    discover.resolves({
      agents: [agent, AiIntegration.AiAgent.CLAUDE_CODE].map(value => ({
        agent: value,
        detectionSources: [AiIntegration.AiAgentDetectionSource.CLI],
        standaloneMcpSupported: true
      }))
    });
    sinon
      .stub(vscode.window, 'showQuickPick')
      .resolves({ agent: AiIntegration.AiAgent.CLAUDE_CODE } as never);
    let agentDuringInspection: AiIntegration.AiAgent | undefined;
    inspect.callsFake(async () => {
      agentDuringInspection = getActiveMcpAgent();
      return { state: AiIntegration.McpConfigurationState.MALFORMED, diagnostics: ['blocked'] };
    });
    await configureMCPServer(client, connections);
    expect(agentDuringInspection).to.equal(AiIntegration.AiAgent.CLAUDE_CODE);
    expect(getActiveMcpAgent()).to.be.undefined;
  });

  test('rejects a second manual setup without disturbing the running setup', async () => {
    let release: (result: unknown) => void;
    let requested: () => void;
    const request = new Promise<void>(resolve => (requested = resolve));
    inspect.callsFake(() => {
      requested();
      return new Promise(resolve => (release = resolve));
    });
    const first = configureMCPServer(client, connections, agent, connection);
    await request;
    const outcome = await configureMCPServer(client, connections, agent, connection);
    expect(outcome.status).to.equal(AiIntegration.AiIntegrationActionStatus.CANCELLED);
    expect(getActiveMcpAgent()).to.equal(agent);
    release({ state: AiIntegration.McpConfigurationState.MALFORMED, diagnostics: ['blocked'] });
    await first;
    expect(isMCPSetupInProgress()).to.be.false;
  });

  test('configures MCP in remote windows', async () => {
    remoteName.value('dev-container');
    const outcome = await configureMCPServer(client, connections, agent, connection);
    expect(outcome).to.deep.equal({ status: AiIntegration.AiIntegrationActionStatus.SUCCEEDED, agent });
    expect(write.calledOnce).to.be.true;
  });

  function remoteCopilot() {
    const copilot = AiIntegration.AiAgent.GITHUB_COPILOT;
    remoteName.value('dev-container');
    sinon.stub(util, 'extensionContext').value({});
    sinon.stub(aiAgentUtils, 'isAgentActiveForMcp').returns(true);
    discover.resolves({
      agents: [{ agent: copilot, detectionSources: [AiIntegration.AiAgentDetectionSource.IDE], standaloneMcpSupported: true }]
    });
    const uri = vscode.Uri.parse('vscode-remote://dev-container+test/home/vscode/.vscode-server/data/User/profiles/review-profile/mcp.json');
    const document = { uri, isDirty: false };
    sinon.stub(vscode.window, 'activeTextEditor').value({ document });
    sinon.stub(vscode.workspace, 'textDocuments').value([document]);
    const remoteRead = sinon.stub().resolves(Buffer.from('{}'));
    const remoteWrite = sinon.stub().resolves();
    sinon.stub(vscode.workspace, 'fs').value({ ...vscode.workspace.fs, readFile: remoteRead, writeFile: remoteWrite });
    return { copilot, uri, document, remoteRead, remoteWrite };
  }

  test('reads and writes the named remote profile selected by VS Code', async () => {
    const { copilot, uri, remoteRead, remoteWrite } = remoteCopilot();
    const outcome = await configureMCPServer(client, connections, copilot, connection);

    expect(outcome.status).to.equal(AiIntegration.AiIntegrationActionStatus.SUCCEEDED);
    expect(commands.calledWithExactly('workbench.mcp.openRemoteUserMcpJson')).to.be.true;
    expect(remoteRead.alwaysCalledWithExactly(uri)).to.be.true;
    expect(remoteWrite.calledOnceWithExactly(uri, Buffer.from(updated))).to.be.true;
    expect(read.called || exists.called || write.called).to.be.false;
    expect(getMCPConfigPath(copilot)).to.equal(uri.fsPath);
  });

  test('reuses the resolved remote URI when re-reading after connection selection', async () => {
    const { copilot, uri, remoteRead, remoteWrite } = remoteCopilot();
    const latest = '{"servers":{"other":{"command":"other-server"}}}';
    remoteRead.onFirstCall().resolves(Buffer.from('{}'));
    remoteRead.resolves(Buffer.from(latest));

    await configureMCPServer(client, connections, copilot, connection);

    expect(plan.firstCall.args[0].content).to.equal(latest);
    expect(remoteRead.alwaysCalledWithExactly(uri)).to.be.true;
    expect(remoteWrite.calledOnce).to.be.true;
  });

  test('rejects concurrent remote file changes before writing', async () => {
    const { copilot, remoteRead, remoteWrite } = remoteCopilot();
    remoteRead.onThirdCall().resolves(Buffer.from('{"changed":true}'));

    expect((await configureMCPServer(client, connections, copilot, connection)).status).to.equal(
      AiIntegration.AiIntegrationActionStatus.FAILED
    );
    expect(remoteWrite.called).to.be.false;
    expect(error.firstCall.args[0]).to.include('changed while preparing');
  });

  test('preserves unsaved remote edits made while setup is running', async () => {
    const { copilot, document, remoteWrite } = remoteCopilot();
    plan.callsFake(async () => {
      document.isDirty = true;
      return { state: AiIntegration.McpConfigurationState.NOT_CONFIGURED, updatedContent: updated, diagnostics: [] };
    });

    expect((await configureMCPServer(client, connections, copilot, connection)).status).to.equal(
      AiIntegration.AiIntegrationActionStatus.FAILED
    );
    expect(remoteWrite.called).to.be.false;
    expect(error.firstCall.args[0]).to.include('Save the MCP configuration');
  });

  test('skips background Copilot refresh until the profile URI has been resolved', async () => {
    const { remoteRead, remoteWrite } = remoteCopilot();

    await onEmbeddedServerStarted(client, 64121);

    expect(commands.calledWith('workbench.mcp.openRemoteUserMcpJson')).to.be.false;
    expect(remoteRead.called || remoteWrite.called || inspect.called || read.called || write.called).to.be.false;
  });

  test('refreshes only the resolved remote profile in later startup notifications', async () => {
    const { copilot, uri, remoteRead, remoteWrite } = remoteCopilot();
    await configureMCPServer(client, connections, copilot, connection);
    commands.resetHistory();
    remoteRead.resolves(Buffer.from(original));
    inspect.resolves({ state: AiIntegration.McpConfigurationState.STANDALONE, diagnostics: [] });
    plan.resolves({ state: AiIntegration.McpConfigurationState.STANDALONE, updatedContent: updated, diagnostics: [] });
    remoteWrite.resetHistory();

    await onEmbeddedServerStarted(client, 64125);

    expect(remoteWrite.calledOnceWithExactly(uri, Buffer.from(updated))).to.be.true;
    expect(plan.lastCall.args[0].sonarMcpConfiguration).to.equal('{"env":{"SONARQUBE_IDE_PORT":"64125"}}');
    expect(commands.calledWith('workbench.mcp.openRemoteUserMcpJson')).to.be.false;
  });

  test('opens the active remote profile through VS Code', async () => {
    const { copilot, uri } = remoteCopilot();
    const open = sinon.stub(vscode.window, 'showTextDocument').resolves();

    expect((await openMCPServerConfigurationFile(client, copilot)).status).to.equal(
      AiIntegration.AiIntegrationActionStatus.SUCCEEDED
    );
    expect(commands.calledWithExactly('workbench.mcp.openRemoteUserMcpJson')).to.be.true;
    expect(getMCPConfigPath(copilot)).to.equal(uri.fsPath);
    expect(open.called).to.be.false;
  });

  test('reports remote read failures without writing a different configuration', async () => {
    const { copilot, remoteRead, remoteWrite } = remoteCopilot();
    remoteRead.rejects(vscode.FileSystemError.NoPermissions('remote configuration'));

    expect((await configureMCPServer(client, connections, copilot, connection)).status).to.equal(
      AiIntegration.AiIntegrationActionStatus.FAILED
    );
    expect(remoteWrite.called || write.called).to.be.false;
  });

  test('uses the latest startup port for the delayed Copilot activation retry', async () => {
    const clock = sinon.useFakeTimers();
    const copilot = AiIntegration.AiAgent.GITHUB_COPILOT;
    sinon
      .stub(aiAgentUtils, 'getDetectedIdeAgents')
      .returns([{ id: copilot, name: 'Copilot', source: 'extension' }]);
    const active = sinon.stub(aiAgentUtils, 'isAgentActiveForMcp').returns(false);
    discover.resolves({
      agents: [
        {
          agent: copilot,
          detectionSources: [AiIntegration.AiAgentDetectionSource.IDE],
          standaloneMcpSupported: true
        }
      ]
    });
    const retry = scheduleCopilotActivationMcpRefresh(client);
    try {
      await onEmbeddedServerStarted(client, 64121);
      await onEmbeddedServerStarted(client, 64125);
      active.returns(true);
      standalone();
      await clock.tickAsync(aiAgentUtils.COPILOT_ACTIVATION_DELAY_MS);
      expect(plan.firstCall.args[0].agent).to.equal(copilot);
      expect(plan.firstCall.args[0].sonarMcpConfiguration).to.equal('{"env":{"SONARQUBE_IDE_PORT":"64125"}}');
    } finally {
      retry.dispose();
      clock.restore();
    }
  });

  test('opens the selected configuration file', async () => {
    exists.returns(true);
    const open = sinon.stub(vscode.window, 'showTextDocument').resolves();
    const outcome = await openMCPServerConfigurationFile(client, agent);
    expect(outcome.status).to.equal(AiIntegration.AiIntegrationActionStatus.SUCCEEDED);
    expect(open.firstCall.args[0].fsPath).to.equal(vscode.Uri.file(getMCPConfigPath(agent)).fsPath);
  });

  test('reports missing files and opening failures', async () => {
    exists.returns(false);
    expect((await openMCPServerConfigurationFile(client, agent)).status).to.equal(
      AiIntegration.AiIntegrationActionStatus.FAILED
    );
    exists.returns(true);
    sinon.stub(vscode.window, 'showTextDocument').rejects(new Error('permission denied'));
    expect((await openMCPServerConfigurationFile(client, agent)).status).to.equal(
      AiIntegration.AiIntegrationActionStatus.FAILED
    );
    expect(error.firstCall.args[0]).to.include('permission denied');
  });
});
