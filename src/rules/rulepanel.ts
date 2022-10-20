/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as FS from 'fs';
import * as VSCode from 'vscode';
import { ShowRuleDescriptionParams } from '../lsp/protocol';
import * as util from '../util/util';
import { clean, escapeHtml, ResourceResolver } from '../util/webview';

let ruleDescriptionPanel: VSCode.WebviewPanel;

export function showRuleDescription(context: VSCode.ExtensionContext) {
  return params => {
    lazyCreateRuleDescriptionPanel(context);
    ruleDescriptionPanel.webview.html = computeRuleDescPanelContent(context, ruleDescriptionPanel.webview, params);
    ruleDescriptionPanel.iconPath = util.resolveExtensionFile('images', 'sonarlint.svg');
    ruleDescriptionPanel.reveal();
  };
}

function lazyCreateRuleDescriptionPanel(context: VSCode.ExtensionContext) {
  if (!ruleDescriptionPanel) {
    ruleDescriptionPanel = VSCode.window.createWebviewPanel(
      'sonarlint.RuleDesc',
      'SonarLint Rule Description',
      VSCode.ViewColumn.Two,
      {
        enableScripts: false
      }
    );
    ruleDescriptionPanel.onDidDispose(
      () => {
        ruleDescriptionPanel = undefined;
      },
      null,
      context.subscriptions
    );
  }
}

function computeRuleDescPanelContent(
  context: VSCode.ExtensionContext,
  webview: VSCode.Webview,
  rule: ShowRuleDescriptionParams
) {

  const resolver = new ResourceResolver(context, webview);
  const styleSrc = resolver.resolve('styles', 'rule.css');
  const severityImgSrc = resolver.resolve('images', 'severity', `${rule.severity.toLowerCase()}.png`);
  const typeImgSrc = resolver.resolve('images', 'type', `${rule.type.toLowerCase()}.png`);

  const ruleParamsHtml = renderRuleParams(rule);

  const taintBanner = renderTaintBanner(rule);

  return `<!doctype html><html lang="en">
    <head>
    <title>${escapeHtml(rule.name)}</title>
    <meta http-equiv="Content-Type" content="text/html;charset=utf-8" />
    <meta http-equiv="Encoding" content="utf-8" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}"/>
    <link rel="stylesheet" type="text/css" href="${styleSrc}" />
    </head>
    <body><h1><big>${escapeHtml(rule.name)}</big> (${rule.key})</h1>
    <div>
    <img class="type" alt="${rule.type}" src="${typeImgSrc}" />&nbsp;
    ${clean(rule.type)}&nbsp;
    <img class="severity" alt="${rule.severity}" src="${severityImgSrc}" />&nbsp;
    ${clean(rule.severity)}
    </div>
    ${taintBanner}
    <div class="rule-desc">${rule.htmlDescription}</div>
    ${ruleParamsHtml}
    </body></html>`;
}

function base64encode(file: string) {
  return FS.readFileSync(file).toString('base64');
}

function renderTaintBanner(rule: ShowRuleDescriptionParams) {
  if (!rule.isTaint) {
    return '';
  }
  return `<div class="taint-banner-wrapper">
            <p class="taint-banner"><span></span> 
            This injection vulnerability was detected by the latest SonarQube or SonarCloud analysis.
             SonarLint fetches and reports it in your local code to help you investigate it and fix it,
              but cannot tell you whether you successfully fixed it. To verify your fix, please ensure
              the code containing your fix is analyzed by SonarQube or SonarCloud.
            </p>
           </div>`;
}

function renderRuleParams(rule: ShowRuleDescriptionParams) {
  if (rule.parameters && rule.parameters.length > 0) {
    const ruleParamsConfig = VSCode.workspace.getConfiguration(`sonarlint.rules.${rule.key}.parameters`);
    return `<table class="rule-params">
  <caption>Parameters</caption>
  <thead>
    <tr>
      <td colspan="2">
        Following parameter values can be set in the <em>SonarLint:Rules</em> user settings.
        In connected mode, server side configuration overrides local settings.
      </td>
    </tr>
  </thead>
  <tbody>
    ${rule.parameters.map(p => renderRuleParam(p, ruleParamsConfig)).join('\n')}
  </tbody>
</table>`;
  } else {
    return '';
  }
}

function renderRuleParam(param, config) {
  const { name, description, defaultValue } = param;
  const descriptionP = description ? `<p>${description}</p>` : '';
  const currentValue = config.has(name) ? `<small>Current value: <code>${config.get(name)}</code></small>` : '';
  const defaultRendered = defaultValue ? `<small>(Default value: <code>${defaultValue}</code>)</small>` : '';
  return `<tr>
  <th>${name}</th>
  <td>
    ${descriptionP}
    ${currentValue}
    ${defaultRendered}
  </td>
</tr>`;
}
