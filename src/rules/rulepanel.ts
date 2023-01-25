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
  const hotspotSrc = resolver.resolve('styles', 'hotspot.css');
  const severityImgSrc = resolver.resolve('images', 'severity', `${rule.severity.toLowerCase()}.png`);
  const typeImgSrc = resolver.resolve('images', 'type', `${rule.type.toLowerCase()}.png`);
  const infoImgSrc = resolver.resolve('images', 'info.png');

  const ruleParamsHtml = renderRuleParams(rule);

  const taintBanner = renderTaintBanner(rule, infoImgSrc);
  const hotspotBanner = renderHotspotBanner(rule, infoImgSrc);
  const ruleDescription = renderRuleDescription(rule);

  return `<!doctype html><html lang="en">
    <head>
    <title>${escapeHtml(rule.name)}</title>
    <meta http-equiv="Content-Type" content="text/html;charset=utf-8" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}"/>
    <link rel="stylesheet" type="text/css" href="${styleSrc}" />
    <link rel="stylesheet" type="text/css" href="${hotspotSrc}" />
    </head>
    <body><h1><big>${escapeHtml(rule.name)}</big> (${rule.key})</h1>
    <div>
    <img class="type" alt="${rule.type}" src="${typeImgSrc}" />&nbsp;
    ${clean(rule.type)}&nbsp;
    <img class="severity" alt="${rule.severity}" src="${severityImgSrc}" />&nbsp;
    ${clean(rule.severity)}
    </div>
    ${taintBanner}
    ${hotspotBanner}
    ${ruleDescription}
    ${ruleParamsHtml}
    </body></html>`;
}

export function renderTaintBanner(rule: ShowRuleDescriptionParams, infoImgSrc: string) {
  if (!rule.isTaint) {
    return '';
  }
  return `<div class="info-banner-wrapper">
            <p class="info-banner"><span><img src=${infoImgSrc} alt="info"></span> 
            This injection vulnerability was detected by the latest SonarQube or SonarCloud analysis.
             SonarLint fetches and reports it in your local code to help you investigate it and fix it,
              but cannot tell you whether you successfully fixed it. To verify your fix, please ensure
              the code containing your fix is analyzed by SonarQube or SonarCloud.
            </p>
           </div>`;
}

export function renderHotspotBanner(rule: ShowRuleDescriptionParams, infoImgSrc: string) {
  if (rule.type !== 'SECURITY_HOTSPOT') {
    return '';
  }
  return `<div class="info-banner-wrapper">
            <p class="info-banner"><span><img src=${infoImgSrc} alt="info"></span> 
            A security hotspot highlights a security-sensitive piece of code that the developer <b>needs to review</b>.
            Upon review, you'll either find there is no threat or you need to apply a fix to secure the code.
            In order to set the review output for a hotspot, please right-click on the hotspot and select the
            'Review on Server' option.
            </p>
           </div>`;
}

export function renderRuleDescription(rule: ShowRuleDescriptionParams) {
  if (rule.htmlDescriptionTabs.length === 0) {
    return `<div class="rule-desc">${rule.htmlDescription}</div>`;
  } else {
    const tabsContent = rule.htmlDescriptionTabs
      .map((tab, index) => `<input type="radio" name="tabs" id="tab-${index}" ${index === 0 ? 'checked="checked"' : ''}>
      <label for="tab-${index}">${tab.title}</label>
      <section class="tab">
      ${tab.description}
      </section>`)
      .join('');
    return `<main class="tabs">${tabsContent}</main>`;
  }
}

export function renderRuleParams(rule: ShowRuleDescriptionParams) {
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

export function renderRuleParam(param, config) {
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
