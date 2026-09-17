/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {
  IdeHost,
  IntegrationTarget,
  getAiIntegrationStateParams,
  getCurrentAgentWithHookSupport,
  getCurrentAgentWithMCPSupport,
  getCurrentIdeHost,
  getDetectedIdeAgents
} from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import { AiIntegration } from '../../../src/lsp/aiIntegrationProtocol';
import { SETUP_TEARDOWN_HOOK_TIMEOUT } from '../commons';

function stubExtensions(installed: Record<string, { isActive?: boolean } | undefined>): void {
  sinon.stub(vscode.extensions, 'getExtension').callsFake(extensionId => {
    const extension = installed[extensionId];
    if (!extension) {
      return undefined;
    }
    return { id: extensionId, isActive: extension.isActive === true } as vscode.Extension<unknown>;
  });
}

suite('aiAgentUtils', () => {
  setup(function () {
    this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
  });

  teardown(() => sinon.restore());

  test('detects extensions available in VS Code without reporting Cursor', () => {
    sinon.stub(vscode.env, 'appName').value('Visual Studio Code');
    stubExtensions({
      'github.copilot-chat': { isActive: false },
      'openai.chatgpt': {}
    });

    expect(getCurrentIdeHost()).to.deep.equal({
      id: IdeHost.VSCODE,
      name: 'VS Code'
    });
    expect(getDetectedIdeAgents().map(agent => agent.id)).to.deep.equal([
      IntegrationTarget.GITHUB_COPILOT,
      AiIntegration.AiAgent.CODEX
    ]);
    expect(getCurrentAgentWithMCPSupport()).to.be.undefined;
  });

  test('requires Copilot to be active before reporting MCP support', () => {
    sinon.stub(vscode.env, 'appName').value('Visual Studio Code');
    stubExtensions({
      'github.copilot-chat': { isActive: true }
    });

    expect(getDetectedIdeAgents().map(agent => agent.id)).to.deep.equal([IntegrationTarget.GITHUB_COPILOT]);
    expect(getCurrentAgentWithMCPSupport()).to.equal(IntegrationTarget.GITHUB_COPILOT);
  });

  test('reports Cursor only when hosted by Cursor', () => {
    sinon.stub(vscode.env, 'appName').value('Cursor');
    stubExtensions({});

    expect(getCurrentIdeHost()).to.deep.equal({
      id: IdeHost.CURSOR,
      name: 'Cursor'
    });
    expect(getDetectedIdeAgents()).to.deep.equal([
      {
        id: IntegrationTarget.CURSOR,
        name: 'Cursor',
        source: 'builtIn'
      }
    ]);
    expect(getCurrentAgentWithMCPSupport()).to.equal(IntegrationTarget.CURSOR);
    expect(getCurrentAgentWithHookSupport()).to.be.undefined;
  });

  test('reports Windsurf plus installed extension agents', () => {
    sinon.stub(vscode.env, 'appName').value('Windsurf');
    stubExtensions({
      'anthropic.claude-code': {}
    });

    expect(getDetectedIdeAgents().map(agent => agent.id)).to.deep.equal([
      IntegrationTarget.WINDSURF,
      AiIntegration.AiAgent.CLAUDE_CODE
    ]);
    expect(getCurrentAgentWithMCPSupport()).to.equal(IntegrationTarget.WINDSURF);
    expect(getCurrentAgentWithHookSupport()).to.equal(IntegrationTarget.WINDSURF);
  });

  test('maps the current host and detected agents onto the SLLS request', () => {
    sinon.stub(vscode.env, 'appName').value('Visual Studio Code');
    stubExtensions({
      'github.copilot-chat': { isActive: true },
      'openai.chatgpt': {}
    });

    expect(getAiIntegrationStateParams(AiIntegration.AiIntegrationScope.PROJECT, 'scope-id')).to.deep.equal({
      ideHost: AiIntegration.AiIntegrationHost.VSCODE,
      detectedAgents: [AiIntegration.AiAgent.GITHUB_COPILOT, AiIntegration.AiAgent.CODEX],
      scope: AiIntegration.AiIntegrationScope.PROJECT,
      configurationScopeId: 'scope-id'
    });
  });

  test('falls back to OTHER for unrecognized hosts', () => {
    sinon.stub(vscode.env, 'appName').value('Some Editor');
    stubExtensions({});

    expect(getCurrentIdeHost()).to.deep.equal({
      id: IdeHost.OTHER,
      name: 'Some Editor'
    });
    expect(getDetectedIdeAgents()).to.deep.equal([]);
    expect(getCurrentAgentWithMCPSupport()).to.be.undefined;
  });
});
