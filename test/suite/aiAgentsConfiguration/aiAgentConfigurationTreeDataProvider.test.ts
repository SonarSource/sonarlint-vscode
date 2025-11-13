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
import { AGENT } from "../../../src/aiAgentsConfiguration/aiAgentUtils";


suite('aiAgentConfigurationTreeDataProvider', () => {
  let underTest: AIAgentsConfigurationTreeDataProvider;

  setup(() => {
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
});
