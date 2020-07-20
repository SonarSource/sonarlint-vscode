/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2020 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as FS from 'fs';
import * as Path from 'path';
import * as VSCode from 'vscode';
import { ShowRuleDescriptionParams } from './protocol';

export function computeRuleDescPanelContent(context: VSCode.ExtensionContext, rule: ShowRuleDescriptionParams) {
  const severityImg = base64encode(
    Path.resolve(context.extensionPath, 'images', 'severity', `${rule.severity.toLowerCase()}.png`)
  );
  const typeImg = base64encode(
    Path.resolve(context.extensionPath, 'images', 'type', `${rule.type.toLowerCase()}.png`)
  );
  const ruleParamsHtml = renderRuleParams(rule);

  return `<!doctype html><html>
		<head>
		<meta http-equiv="Content-Type" content="text/html;charset=utf-8" />
		<meta http-equiv="Encoding" content="utf-8" />
		<meta http-equiv="Content-Security-Policy" value="default-src 'none'"/>
		<style type="text/css">
			body {
				font-family: 'Helvetica Neue','Segoe UI',Helvetica,Arial,sans-serif;
				font-size: 13px; line-height: 1.23076923;
			}

			h1 { font-size: 14px;font-weight: 500; }
			h2 { line-height: 24px;}
			a { border-bottom: 1px solid rgba(230, 230, 230, .1); color: #236a97; cursor: pointer; outline: none; text-decoration: none; transition: all .2s ease;}

			.rule-desc { line-height: 1.5;}
			.rule-desc h2 { font-size: 16px; font-weight: 400;}
			.rule-desc code { padding: .2em .45em; margin: 0; border-radius: 3px; white-space: nowrap;}
			.rule-desc pre { padding: 10px; border-top: 1px solid rgba(230, 230, 230, .1); border-bottom: 1px solid rgba(230, 230, 230, .1); line-height: 18px; overflow: auto;}
			.rule-desc code, .rule-desc pre { font-family: Consolas,Liberation Mono,Menlo,Courier,monospace; font-size: 12px;}
			.rule-desc ul { padding-left: 40px; list-style: disc;}
			.rule-params { border: none; border-collapse: collapse; padding: 1em; }
			.rule-params caption { font-size: 16px; font-weight: 400; text-align: left; margin-bottom: 16px}
			.rule-params thead td { vertical-align: top; padding-left: 0; padding-bottom: 1em; font-style: italic }
			.rule-params tbody th { vertical-align: top; text-align: right; font-weight: inherit; font-family: monospace }
			.rule-params tbody td { vertical-align: top; padding-left: 1em; padding-bottom: 1em; }
			.rule-params p { margin: 0 }
			.rule-params small { display: block; margin-top: 2px }
			</style>
		</head>
		<body><h1><big>${escapeHtml(rule.name)}</big> (${rule.key})</h1>
		<div>
		<img style="padding-bottom: 1px;vertical-align: middle" width="16" height="16" alt="${
      rule.type
    }" src="data:image/gif;base64,${typeImg}">&nbsp;
		${clean(rule.type)}&nbsp;
		<img style="padding-bottom: 1px;vertical-align: middle" width="16" height="16" alt="${
      rule.severity
    }" src="data:image/gif;base64,${severityImg}">&nbsp;
		${clean(rule.severity)}
		</div>
    <div class="rule-desc">${rule.htmlDescription}</div>
    ${ruleParamsHtml}
		</body></html>`;
}

const entityMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

function escapeHtml(str: string) {
  return String(str).replace(/[&<>""`=\/]/g, function(s) {
    return entityMap[s];
  });
}

function clean(str: string) {
  return capitalizeName(
    str
      .toLowerCase()
      .split('_')
      .join(' ')
  );
}

function capitalizeName(name: string) {
  return name.replace(/\b(\w)/g, s => s.toUpperCase());
}

function base64encode(file: string) {
  return FS.readFileSync(file).toString('base64');
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
