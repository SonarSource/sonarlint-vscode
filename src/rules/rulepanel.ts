/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { capitalize } from 'lodash';
import * as VSCode from 'vscode';
import { SonarLintDocumentation } from '../commons';
import { ShowRuleDescriptionParams } from '../lsp/protocol';
import * as util from '../util/util';
import { clean, escapeHtml, ResourceResolver } from '../util/webview';
import { decorateContextualHtmlContentWithDiff } from './code-diff';
import { highlightAllCodeSnippetsInDesc } from './syntax-highlight';
import * as fs from 'fs';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

let ruleDescriptionPanel: VSCode.WebviewPanel;

export function showRuleDescription(context: VSCode.ExtensionContext) {
  return params => {
    if (!params) {
      return;
    }
    lazyCreateRuleDescriptionPanel(context);
    ruleDescriptionPanel.webview.html = computeRuleDescPanelContent(context, ruleDescriptionPanel.webview, params);
    ruleDescriptionPanel.iconPath = {
      light: util.resolveExtensionFile('images', 'sonarqube_for_ide.svg'),
      dark: util.resolveExtensionFile('images', 'sonarqube_for_ide_dark.svg')
    };
    ruleDescriptionPanel.reveal();
    
    // Return focus to the first editor group after opening the rule description panel; This way, any new editor will be opened in the first group
    VSCode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
  };
}

function lazyCreateRuleDescriptionPanel(context: VSCode.ExtensionContext) {
  if (!ruleDescriptionPanel) {
    ruleDescriptionPanel = VSCode.window.createWebviewPanel(
      'sonarlint.RuleDesc',
      'SonarQube Rule Description',
      VSCode.ViewColumn.Two,
      {
        enableScripts: true
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
  const themeSrc = resolver.resolve('styles', 'theme.css');
  const styleSrc = resolver.resolve('styles', 'rule.css');
  const hljsSrc = resolver.resolve('styles', 'vs.css');
  const hotspotSrc = resolver.resolve('styles', 'hotspot.css');
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
    <link rel="stylesheet" type="text/css" href="${themeSrc}" />
    <link rel="stylesheet" type="text/css" href="${styleSrc}" />
    <link rel="stylesheet" type="text/css" href="${hotspotSrc}" />
    <link rel="stylesheet" type="text/css" href="${hljsSrc}" />
    </head>
    <body>
    <h1><big>${escapeHtml(rule.name)}</big> (${rule.key})</h1>
    ${renderTaxonomyInfo(rule, resolver)}
    ${taintBanner}
    ${hotspotBanner}
    ${ruleDescription}
    ${ruleParamsHtml}
    </body></html>`;
}

function renderCleanCodeAttribute(rule: ShowRuleDescriptionParams) {
  const categoryLabel = escapeHtml(rule.severityDetails.cleanCodeAttributeCategory);
  const attributeLabel = escapeHtml(rule.severityDetails.cleanCodeAttribute);
  return `<div class="clean-code-attribute capsule" title="Clean Code attributes are characteristics code needs to have to be considered clean.">
  <span class="attribute-category">${categoryLabel} issue</span>
  <span class="attribute">${attributeLabel}</span>
</div>`;
}

function renderImpact(softwareQuality: string, severity: string, resolver: ResourceResolver) {
  const softwareQualityLowerCase = softwareQuality.toLocaleLowerCase('en-us');
  const impactSeverityLowerCase = severity.toLocaleLowerCase('en-us');
  const impactSeverityImgSrc = resolver.resolve('images', 'impact', `${impactSeverityLowerCase}.svg`);
  const formattedImpact = `Issues found for this rule will have a ${impactSeverityLowerCase} impact on the ${softwareQualityLowerCase} of your software.`;
    return `<div class="impact impact-${impactSeverityLowerCase} capsule" title="${formattedImpact}">
  <span>${capitalize(softwareQualityLowerCase)}</span>
  <img alt="${capitalize(impactSeverityLowerCase)}" src="${impactSeverityImgSrc}" />
</div>`;
}

const severityToImpact = {
  'info': 'info',
  'minor': 'low',
  'major': 'medium',
  'critical': 'high',
  'blocker': 'blocker'
}

function renderStandardModeSeverityDetails(ruleType: string, severity: string) {
  const ruleTypeToLowerCase = ruleType.toLocaleLowerCase('en-us');
  const severityToLowerCase = severity.toLocaleLowerCase('en-us');
  const ruleTypeImgSrc = util.resolveExtensionFile('images', 'type', `${ruleTypeToLowerCase}.svg`);
  const severityImgSrc = util.resolveExtensionFile('images', 'impact', `${severityToImpact[severityToLowerCase]}.svg`);
  const formattedDescription = `${escapeHtml(severityToLowerCase)} ${escapeHtml(ruleTypeToLowerCase.replace(/_/g, ' '))}`;
  return `<div class="impact severity-${severityToLowerCase} capsule" title="${formattedDescription}">
  ${fetchSVGIcon(ruleTypeImgSrc)}
  &nbsp;${clean(ruleType)}&nbsp;
  ${fetchSVGIcon(severityImgSrc)}
  </div>`;
}

function fetchSVGIcon(pathToSVG: VSCode.Uri) : string {
  const svgText = fs.readFileSync(pathToSVG.fsPath, 'utf8');
  const parser : DOMParser = new DOMParser();
  const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
  const svgElement = svgDoc.documentElement;

  return new XMLSerializer().serializeToString(svgElement);
}

function renderTaxonomyInfo(rule: ShowRuleDescriptionParams, resolver: ResourceResolver) {
  if (rule.severityDetails.impacts && Object.keys(rule.severityDetails.impacts).length > 0) {
    // Clean Code taxonomy
    const renderedImpacts = Object.entries(rule.severityDetails.impacts).map(([softwareQuality, severity]) => renderImpact(softwareQuality, severity, resolver));
    return `<div class="taxonomy">
  ${renderCleanCodeAttribute(rule)}
  &nbsp;
  ${renderedImpacts.join('&nbsp;')}
  &nbsp;
  <a href="${SonarLintDocumentation.CLEAN_CODE_CONCEPTS}" class="capsule"
    title="Check out the Clean Code concepts in the SonarQube for VS Code documentation"
    rel="external glossary" target="_blank" referrerpolicy="no-referrer">What is clean code?</a>
</div>`;
  } else {
    // Old type + severity taxonomy
    return `<div class="taxonomy">
      ${renderStandardModeSeverityDetails(rule.severityDetails.type, rule.severityDetails.severity)}
</div>`;
  }
}

export function renderTaintBanner(rule: ShowRuleDescriptionParams, infoImgSrc: string) {
  if (!rule.isTaint) {
    return '';
  }
  return `<div class="info-banner-wrapper">
            <p class="info-banner"><span><img src=${infoImgSrc} alt="info"></span> 
            This injection vulnerability was detected by the latest SonarQube (Server, Cloud) analysis.
             SonarQube for VS Code fetches and reports it in your local code to help you investigate it and fix it,
              but cannot tell you whether you successfully fixed it. To verify your fix, please ensure
              the code containing your fix is analyzed by SonarQube (Server, Cloud).
            </p>
           </div>`;
}

export function renderHotspotBanner(rule: ShowRuleDescriptionParams, infoImgSrc: string) {
  if (rule.severityDetails.type !== 'SECURITY_HOTSPOT') {
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
    const newDesc = highlightAllCodeSnippetsInDesc(rule.htmlDescription, rule.languageKey, false);
    return `<div class="rule-desc">${newDesc}</div>`;
  } else {
    const tabsContent = rule.htmlDescriptionTabs
      .map((tab, index) => {
        let content;
        if (tab.hasContextualInformation) {
          content = computeTabContextualDescription(tab, rule.languageKey);
        } else {
          content = highlightAllCodeSnippetsInDesc(
            decorateContextualHtmlContentWithDiff(tab.ruleDescriptionTabNonContextual.htmlContent),
            rule.languageKey,
            true
          );
          content = `<div class='rule-desc'>${content}</div>`;
        }
        return `<input type="radio" name="tabs" id="tab-${index}" ${index === 0 ? 'checked="checked"' : ''}>
        <label for="tab-${index}" class="tabLabel">${tab.title}</label>
        <section class="tab${tab.hasContextualInformation ? ' contextualTabContainer' : ''}">
          ${content}
        </section>`;
      })
      .join('');
    return `<main class="tabs">${tabsContent}</main>`;
  }
}

function computeTabContextualDescription(tab, languageKey) {
  const defaultContextKey = tab.defaultContextKey ? tab.defaultContextKey : 'others';
  const contextRadioButtons = tab.ruleDescriptionTabContextual.map((contextualDescription, contextIndex) => {
    const checked = isChecked(contextualDescription, defaultContextKey);
    const newContent = highlightAllCodeSnippetsInDesc(
      decorateContextualHtmlContentWithDiff(contextualDescription.htmlContent),
      languageKey,
      true
    );
    return `<input type="radio" name="contextualTabs" id="context-${contextIndex}"
                        class="contextualTab" ${checked}>
              <label for="context-${contextIndex}" class="contextLabel">${contextualDescription.displayName}</label>
              <section class="tab">
              <h4>${computeHeading(tab, contextualDescription)}</h4>
                <div class="rule-desc">
                ${newContent}
                </div>
              </section>`;
  });
  return contextRadioButtons.join('');
}

function isChecked(contextualDescription, defaultContextKey) {
  if (`${contextualDescription.contextKey}` === defaultContextKey) {
    return 'checked="checked"';
  }
  return '';
}

export function computeHeading(tab, contextualDescription) {
  const trimmedTabTitle = tab.title.endsWith('?') ? tab.title.substring(0, tab.title.length - 1) : tab.title;
  return contextualDescription.contextKey === 'others'
    ? ''
    : `${trimmedTabTitle} in ${contextualDescription.displayName}`;
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
