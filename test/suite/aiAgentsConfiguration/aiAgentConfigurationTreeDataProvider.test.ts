/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Commands } from "../../../src/util/commands";
import { AIAgentsConfigurationTreeDataProvider } from "../../../src/aiAgentsConfiguration/aiAgentsConfigurationTreeDataProvider";
import { expect } from "chai";
import * as mcpServerConfig from "../../../src/aiAgentsConfiguration/mcpServerConfig";
import * as sinon from 'sinon';
import * as aiAgentRuleConfig from "../../../src/aiAgentsConfiguration/aiAgentRuleConfig";
import * as aiAgentUtils from "../../../src/aiAgentsConfiguration/aiAgentUtils";
import * as aiAgentHooks from "../../../src/aiAgentsConfiguration/aiAgentHooks";
import { AGENT } from "../../../src/aiAgentsConfiguration/aiAgentUtils";
import { SETUP_TEARDOWN_HOOK_TIMEOUT } from "../commons";


suite('aiAgentConfigurationTreeDataProvider', () => {
  let underTest: AIAgentsConfigurationTreeDataProvider;

  setup(function () {
    this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
    underTest = new AIAgentsConfigurationTreeDataProvider();
  });

  teardown(() => {
    sinon.restore();
  });

  test('getChildren should return empty list when no MCP server is configured', async () => {
    sinon.stub(mcpServerConfig, 'getCurrentSonarQubeMCPServerConfig').returns(undefined);
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);

    const children = await underTest.getChildren();

    expect(children.length).to.equal(0);
  });

  test('getChildren should return MCP server and rules file items when both are configured', async () => {

    sinon.stub(mcpServerConfig, 'getCurrentSonarQubeMCPServerConfig').returns({
      command: 'test-command',
      args: ['test-arg'],
      env: {}
    });

    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(true);
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithMCPSupport').returns(AGENT.CURSOR);

    const children = await underTest.getChildren();
    expect(children.map(c => [ c.label, c.tooltip, c.command.command ])).to.deep.equal([
        [ 'Configure SonarQube MCP Server', 'AI agent integration • Configured', Commands.OPEN_MCP_SERVER_CONFIGURATION ],
        [ 'Create Instructions for AI agents', 'SonarQube MCP Server guide • Configured', Commands.OPEN_SONARQUBE_RULES_FILE ]
      ]);
  });

  test('getChildren should return both items for GitHub Copilot', async () => {
    sinon.stub(mcpServerConfig, 'getCurrentSonarQubeMCPServerConfig').returns({
      command: 'test-command',
      args: ['test-arg'],
      env: {}
    });

    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(true);
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithMCPSupport').returns(AGENT.GITHUB_COPILOT);

    const children = await underTest.getChildren();
    expect(children.map(c => [ c.label, c.tooltip, c.command.command ])).to.deep.equal([
        [ 'Configure SonarQube MCP Server', 'AI agent integration • Configured', Commands.OPEN_MCP_SERVER_CONFIGURATION ],
        [ 'Create Instructions for AI agents', 'SonarQube MCP Server guide • Configured', Commands.OPEN_SONARQUBE_RULES_FILE ]
    ]);
  });

  test('getChildren should return both items for Windsurf', async () => {
    sinon.stub(mcpServerConfig, 'getCurrentSonarQubeMCPServerConfig').returns({
      command: 'test-command',
      args: ['test-arg'],
      env: {}
    });

    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(true);
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithMCPSupport').returns(AGENT.WINDSURF);

    const children = await underTest.getChildren();
    expect(children.map(c => [ c.label, c.tooltip, c.command.command ])).to.deep.equal([
        [ 'Configure SonarQube MCP Server', 'AI agent integration • Configured', Commands.OPEN_MCP_SERVER_CONFIGURATION ],
        [ 'Create Instructions for AI agents', 'SonarQube MCP Server guide • Configured', Commands.OPEN_SONARQUBE_RULES_FILE ]
    ]);
  });

  test('getChildren should return both items for Kiro', async () => {
    sinon.stub(mcpServerConfig, 'getCurrentSonarQubeMCPServerConfig').returns({
      command: 'test-command',
      args: ['test-arg'],
      env: {}
    });

    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(true);
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithMCPSupport').returns(AGENT.KIRO);

    const children = await underTest.getChildren();
    expect(children.map(c => [ c.label, c.tooltip, c.command.command ])).to.deep.equal([
        [ 'Configure SonarQube MCP Server', 'AI agent integration • Configured', Commands.OPEN_MCP_SERVER_CONFIGURATION ],
        [ 'Create Instructions for AI agents', 'SonarQube MCP Server guide • Configured', Commands.OPEN_SONARQUBE_RULES_FILE ]
    ]);
  });

  test('getChildren should return only MCP server item when agent is not supported', async () => {
    sinon.stub(mcpServerConfig, 'getCurrentSonarQubeMCPServerConfig').returns({
      command: 'test-command',
      args: ['test-arg'],
      env: {}
    });

    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);
    sinon.stub(aiAgentUtils, 'getCurrentAgentWithMCPSupport').returns(undefined);

    const children = await underTest.getChildren();
    expect(children.map(c => [ c.label, c.tooltip, c.command.command ])).to.deep.equal([
        [ 'Configure SonarQube MCP Server', 'AI agent integration • Configured', Commands.OPEN_MCP_SERVER_CONFIGURATION ]
    ]);
  });

  suite('Hook Script Installation Item', () => {
    test('should include hook script item when agent with hook support is present and hook is not installed', async () => {
      sinon.stub(mcpServerConfig, 'getCurrentSonarQubeMCPServerConfig').returns(undefined);
      sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);
      sinon.stub(aiAgentUtils, 'getCurrentAgentWithMCPSupport').returns(undefined);
      sinon.stub(aiAgentUtils, 'getCurrentAgentWithHookSupport').returns(AGENT.WINDSURF);
      sinon.stub(aiAgentHooks, 'isHookInstalled').resolves(false);

      const children = await underTest.getChildren();

      expect(children.length).to.equal(2); // MCP Server + Hook Script
      const hookItem = children.find(c => c.id === 'hookScript');
      expect(hookItem).to.not.be.undefined;
      expect(hookItem.label).to.equal('Install Hook for Code Analysis');
      expect(hookItem.isConfigured).to.be.false;
      expect(hookItem.tooltip).to.equal('Automatically analyze code after AI generation');
      expect(hookItem.command.command).to.equal(Commands.INSTALL_AI_AGENT_HOOK_SCRIPT);
    });

    test('should include hook script item when agent with hook support is present and hook is installed', async () => {
      sinon.stub(mcpServerConfig, 'getCurrentSonarQubeMCPServerConfig').returns(undefined);
      sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);
      sinon.stub(aiAgentUtils, 'getCurrentAgentWithMCPSupport').returns(undefined);
      sinon.stub(aiAgentUtils, 'getCurrentAgentWithHookSupport').returns(AGENT.WINDSURF);
      sinon.stub(aiAgentHooks, 'isHookInstalled').resolves(true);

      const children = await underTest.getChildren();

      expect(children.length).to.equal(2); // MCP Server + Hook Script
      const hookItem = children.find(c => c.id === 'hookScript');
      expect(hookItem).to.not.be.undefined;
      expect(hookItem.label).to.equal('Install Hook for Code Analysis');
      expect(hookItem.isConfigured).to.be.true;
      expect(hookItem.tooltip).to.equal('Automatically analyze code after AI generation • Configured');
      expect(hookItem.command.command).to.equal(Commands.OPEN_AI_AGENT_HOOK_SCRIPT);
    });

    test('should not include hook script item when no agent with hook support', async () => {
      sinon.stub(mcpServerConfig, 'getCurrentSonarQubeMCPServerConfig').returns({
        command: 'test-command',
        args: ['test-arg'],
        env: {}
      });
      sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);
      sinon.stub(aiAgentUtils, 'getCurrentAgentWithMCPSupport').returns(AGENT.CURSOR);
      sinon.stub(aiAgentUtils, 'getCurrentAgentWithHookSupport').returns(undefined);

      const children = await underTest.getChildren();

      const hookItem = children.find(c => c.id === 'hookScript');
      expect(hookItem).to.be.undefined;
    });

    test('should include hook script item along with MCP server and rules file items', async () => {
      sinon.stub(mcpServerConfig, 'getCurrentSonarQubeMCPServerConfig').returns({
        command: 'test-command',
        args: ['test-arg'],
        env: {}
      });
      sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(true);
      sinon.stub(aiAgentUtils, 'getCurrentAgentWithMCPSupport').returns(AGENT.WINDSURF);
      sinon.stub(aiAgentUtils, 'getCurrentAgentWithHookSupport').returns(AGENT.WINDSURF);
      sinon.stub(aiAgentHooks, 'isHookInstalled').resolves(false);

      const children = await underTest.getChildren();

      expect(children.length).to.equal(3); // MCP Server + Rules File + Hook Script
      expect(children.map(c => c.label)).to.deep.equal([
        'Configure SonarQube MCP Server',
        'Create Instructions for AI agents',
        'Install Hook for Code Analysis'
      ]);

      const hookItem = children[2];
      expect(hookItem.id).to.equal('hookScript');
      expect(hookItem.isConfigured).to.be.false;
    });
  });
});
