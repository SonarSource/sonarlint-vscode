/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { HotspotProbability, HotspotStatus, RemoteHotspot } from '../lsp/protocol';
import { renderRuleDescription } from '../rules/rulepanel';
import * as util from '../util/util';
import { escapeHtml, ResourceResolver } from '../util/webview';

function formatProbability(vulnerabilityProbability: HotspotProbability) {
  const probabilityName = HotspotProbability[vulnerabilityProbability];
  return `<span class="hotspot-probability hotspot-probability-${probabilityName}">${probabilityName}</span>`;
}

function formatStatus(status: HotspotStatus) {
  return status === HotspotStatus.ToReview ? 'To review' : 'Reviewed';
}

const categoryShortToLong = {
  'buffer-overflow': 'Buffer Overflow',
  'sql-injection': 'SQL Injection',
  'rce': 'Code Injection (RCE)',
  'object-injection': 'Object Injection',
  'command-injection': 'Command Injection',
  'path-traversal-injection': 'Path Traversal Injection',
  'ldap-injection': 'LDAP Injection',
  'xpath-injection': 'XPath Injection',
  'expression-lang-injection': 'Expression Language Injection',
  'log-injection': 'Log Injection',
  'xxe': 'XML External Entity (XXE)',
  'xss': 'Cross-Site Scripting (XSS)',
  'dos': 'Denial of Service (DoS)',
  'ssrf': 'Server-Side Request Forgery (SSRF)',
  'csrf': 'Cross-Site Request Forgery (CSRF)',
  'http-response-splitting': 'HTTP Response Splitting',
  'open-redirect': 'Open Redirect',
  'weak-cryptography': 'Weak Cryptography',
  'auth': 'Authentication',
  'insecure-conf': 'Insecure Configuration',
  'file-manipulation': 'File Manipulation',
  'others': 'Others'
};

export function computeHotspotContextPanelContent(hotspot: RemoteHotspot, webview: vscode.Webview) {

  const resolver = new ResourceResolver(util.extensionContext, webview);
  const styleSrc = resolver.resolve('styles', 'rule.css');
  const hotspotSrc = resolver.resolve('styles', 'hotspot.css');
  const hljsSrc = resolver.resolve('styles', 'vs.css');

  const category = categoryShortToLong[hotspot.rule.securityCategory];
  const priority = formatProbability(hotspot.rule.vulnerabilityProbability);
  const author = hotspot.author;
  const status = formatStatus(hotspot.status);

  const ruleDescription = renderRuleDescription(hotspotRuleToDescriptionParams(hotspot));

  return `<!doctype html><html lang="en">
  <head>
    <title>${escapeHtml(hotspot.message)}</title>
    <meta http-equiv="Content-Type" content="text/html;charset=utf-8" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource}"/>
    <link rel="stylesheet" type="text/css" href="${styleSrc}" />
    <link rel="stylesheet" type="text/css" href="${hotspotSrc}" />
    <link rel="stylesheet" type="text/css" href="${hljsSrc}" />
  </head>
  <body>
    <h1><big>${escapeHtml(hotspot.message)}</big> (${hotspot.rule.key})</h1>
    <dl class="hotspot-header">
      <dd>Category</dd><dt>${category}</dt>
      <dd>Review priority</dd><dt>${priority}</dt>
      <dd>Author</dd><dt>${author}</dt>
      <dd>Status</dd><dt>${status}</dt>
    </dl>

    ${ruleDescription}

    </body>
</html>`;
}

function hotspotRuleToDescriptionParams(hotspot: RemoteHotspot) {
  const { key, name, riskDescription, vulnerabilityDescription, fixRecommendations } = hotspot.rule;
  return {
    key,
    name,
    htmlDescription: '',
    htmlDescriptionTabs: [
      {
        title: `What's the risk?`,
        hasContextualInformation: false,
        ruleDescriptionTabNonContextual: {
          htmlContent: riskDescription
        }
      },
      {
        title: `Assess the risk`,
        hasContextualInformation: false,
        ruleDescriptionTabNonContextual: {
          htmlContent: vulnerabilityDescription
        }
      },
      {
        title: `How can I fix it?`,
        hasContextualInformation: false,
        ruleDescriptionTabNonContextual: {
          htmlContent: fixRecommendations
        }
      }
    ],
    type: 'SECURITY_HOTSPOT',
    severity: '',
    isTaint: false,
    // XXX Find a way to pass language for syntax highlighting?
    languageKey: '',
    parameters: []
  };
}
