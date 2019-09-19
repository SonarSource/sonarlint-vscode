/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2019 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
"use strict";

import * as FS from "fs";
import * as Path from "path";
import * as VSCode from "vscode";

export function computeRuleDescPanelContent(
  context: VSCode.ExtensionContext,
  ruleKey: string,
  ruleName: string,
  htmlDesc: string,
  ruleType: string,
  ruleSeverity: string
) {
  const severityImg = base64_encode(Path.resolve(
    context.extensionPath,
    "images",
    "severity",
    ruleSeverity.toLowerCase() + ".png"
  ));
  const typeImg = base64_encode(Path.resolve(
    context.extensionPath,
    "images",
    "type",
    ruleType.toLowerCase() + ".png"
  ));

  return `<!doctype html><html>
		<head>
		<style type="text/css">
			body { 
				font-family: Helvetica Neue,Segoe UI,Helvetica,Arial,sans-serif; 
				font-size: 13px; line-height: 1.23076923; 
			}
			
			h1 { font-size: 14px;font-weight: 500; }
			h2 { line-height: 24px;}
			a { border-bottom: 1px solid rgba(230, 230, 230, .1); color: #236a97; cursor: pointer; outline: none; text-decoration: none; transition: all .2s ease;}
			
			.rule-desc { line-height: 1.5;}
			.rule-desc { line-height: 1.5;}
			.rule-desc h2 { font-size: 16px; font-weight: 400;}
			.rule-desc code { padding: .2em .45em; margin: 0; border-radius: 3px; white-space: nowrap;}
			.rule-desc pre { padding: 10px; border-top: 1px solid rgba(230, 230, 230, .1); border-bottom: 1px solid rgba(230, 230, 230, .1); line-height: 18px; overflow: auto;}
			.rule-desc code, .rule-desc pre { font-family: Consolas,Liberation Mono,Menlo,Courier,monospace; font-size: 12px;}
			.rule-desc ul { padding-left: 40px; list-style: disc;}
		</style>
		</head>
		<body><h1><big>${escapeHtml(ruleName)}</big> (${ruleKey})</h1>
		<div>
		<img style="padding-bottom: 1px;vertical-align: middle" width="16" height="16" alt="${ruleType}" src="data:image/gif;base64,${typeImg}">&nbsp;
		${clean(ruleType)}&nbsp;
		<img style="padding-bottom: 1px;vertical-align: middle" width="16" height="16" alt="${ruleSeverity}" src="data:image/gif;base64,${severityImg}">&nbsp;
		${clean(ruleSeverity)}
		</div>
		<div class=\"rule-desc\">${htmlDesc}</div>
		</body></html>`;
}

const entityMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
  "/": "&#x2F;",
  "`": "&#x60;",
  "=": "&#x3D;"
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
      .split("_")
      .join(" ")
  );
}

function capitalizeName(name: string) {
  return name.replace(/\b(\w)/g, s => s.toUpperCase());
}

function base64_encode(file: string) {
  const bitmap = FS.readFileSync(file);
  return new Buffer(bitmap).toString("base64");
}