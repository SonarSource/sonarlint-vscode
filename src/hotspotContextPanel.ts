/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { HotspotProbability, HotspotStatus, RemoteHotspot } from './protocol';
import * as util from './util';
import { ResourceResolver } from './webview';

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
  const styleSrc = resolver.resolve('styles', 'hotspot.css');

  const category = categoryShortToLong[hotspot.rule.securityCategory];
  const priority = formatProbability(hotspot.rule.vulnerabilityProbability);
  const author = hotspot.author;
  const status = formatStatus(hotspot.status);

  return `<!doctype html><html>
  <head>
    <meta http-equiv="Content-Type" content="text/html;charset=utf-8" />
    <meta http-equiv="Encoding" content="utf-8" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource}"/>
    <link rel="stylesheet" type="text/css" href="${styleSrc}" />
  </head>
  <body>
    <h1><big>${hotspot.message}</big> (${hotspot.rule.key})</h1>
    <dl class="hotspot-header">
      <dd>Category</dd><dt>${category}</dt>
      <dd>Review priority</dd><dt>${priority}</dt>
      <dd>Author</dd><dt>${author}</dt>
      <dd>Status</dd><dt>${status}</dt>
    </dl>

    <main class="tabs">
      <input type="radio" name="tabs" id="tabone" checked="checked">
      <label for="tabone">What's the risk?</label>
      <section class="tab">
      ${hotspot.rule.riskDescription}
      </section>

      <input type="radio" name="tabs" id="tabtwo">
      <label for="tabtwo">Are you at risk?</label>
      <section class="tab">
      ${hotspot.rule.vulnerabilityDescription}
      </section>

      <input type="radio" name="tabs" id="tabthree">
      <label for="tabthree">How can you fix it?</label>
      <section class="tab">
      ${hotspot.rule.fixRecommendations}
      </section>
    </main>
    </body>
</html>`;
}
