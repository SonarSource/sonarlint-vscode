/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
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
import { IDE } from "../../../src/aiAgentsConfiguration/aiAgentUtils";


suite('aiAgentConfigurationTreeDataProvider', () => {
  let underTest: AIAgentsConfigurationTreeDataProvider;

  setup(() => {
    underTest = new AIAgentsConfigurationTreeDataProvider();
  });

  teardown(() => {
    sinon.restore();
  });

  test('getChildren should return empty list when no MCP server is configured', async () => {
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
    sinon.stub(aiAgentUtils, 'getCurrentIdeWithMCPSupport').returns(IDE.CURSOR);

    const children = await underTest.getChildren();
    expect(children.map(c => [ c.label, c.tooltip, c.command.command ])).to.deep.equal([
        [ 'Configure SonarQube MCP Server', 'AI agent integration • Configured', Commands.OPEN_MCP_SERVER_CONFIGURATION ],
        [ 'Create Instructions for AI agents', 'SonarQube MCP Server guide • Configured', Commands.OPEN_SONARQUBE_RULES_FILE ]
      ]);
  });

  test('getChildren should return MCP server item only when not in Cursor', async () => {
    sinon.stub(mcpServerConfig, 'getCurrentSonarQubeMCPServerConfig').returns({
      command: 'test-command',
      args: ['test-arg'],
      env: {}
    });

    sinon.stub(aiAgentUtils, 'getCurrentIdeWithMCPSupport').returns(IDE.VSCODE);

    const children = await underTest.getChildren();
    expect(children.map(c => [ c.label, c.tooltip, c.command.command ])).to.deep.equal([
        [ 'Configure SonarQube MCP Server', 'AI agent integration • Configured', Commands.OPEN_MCP_SERVER_CONFIGURATION ]
    ]);
  });
});