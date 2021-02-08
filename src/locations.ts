/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';

const issuesJson = `{"total":1,"p":1,"ps":100,"paging":{"pageIndex":1,"pageSize":100,"total":1},"effortTotal":30,"debtTotal":30,"issues":[{"key":"AW0p2Qpn-y65ELkujuRf","rule":"javasecurity:S2076","severity":"BLOCKER","component":"com.sonarsource:citytour2019-java:src/main/java/foo/security/injection/CommandInjectionVulnerability.java","project":"com.sonarsource:citytour2019-java","line":17,"hash":"1703916771e6abb765843e62a76fcb5a","textRange":{"startLine":17,"endLine":17,"startOffset":4,"endOffset":25},"flows":[{"locations":[{"component":"com.sonarsource:citytour2019-java:src/main/java/foo/security/injection/CommandInjectionVulnerability.java","textRange":{"startLine":17,"endLine":17,"startOffset":4,"endOffset":25},"msg":"tainted value is used to perform a security-sensitive operation"},{"component":"com.sonarsource:citytour2019-java:src/main/java/foo/security/injection/CommandInjectionVulnerability.java","textRange":{"startLine":14,"endLine":14,"startOffset":6,"endOffset":40},"msg":"taint value is propagated"},{"component":"com.sonarsource:citytour2019-java:src/main/java/foo/security/injection/CommandInjectionVulnerability.java","textRange":{"startLine":8,"endLine":8,"startOffset":9,"endOffset":38},"msg":"taint value is propagated"},{"component":"com.sonarsource:citytour2019-java:src/main/java/foo/security/injection/Servlet.java","textRange":{"startLine":38,"endLine":38,"startOffset":6,"endOffset":54},"msg":"taint value is propagated"},{"component":"com.sonarsource:citytour2019-java:src/main/java/foo/security/injection/Servlet.java","textRange":{"startLine":36,"endLine":36,"startOffset":6,"endOffset":72},"msg":"taint value is propagated"},{"component":"com.sonarsource:citytour2019-java:src/main/java/foo/security/injection/Servlet.java","textRange":{"startLine":36,"endLine":36,"startOffset":22,"endOffset":72},"msg":"taint value is propagated"},{"component":"com.sonarsource:citytour2019-java:src/main/java/foo/security/injection/Servlet.java","textRange":{"startLine":34,"endLine":34,"startOffset":4,"endOffset":59},"msg":"taint value is propagated"},{"component":"com.sonarsource:citytour2019-java:src/main/java/foo/security/injection/Servlet.java","textRange":{"startLine":34,"endLine":34,"startOffset":20,"endOffset":59},"msg":"this value can be controlled by the user"}]}],"status":"REOPENED","message":"Refactor this code to not construct the OS command from tainted, user-controlled data.","effort":"30min","debt":"30min","author":"alexandre.gigleux@sonarsource.com","tags":["cwe","owasp-a1","sans-top25-insecure"],"transitions":["confirm","resolve","falsepositive","wontfix"],"actions":["set_type","set_tags","comment","set_severity","assign"],"comments":[],"creationDate":"2019-09-11T12:25:08+0000","updateDate":"2021-01-20T13:16:47+0000","type":"VULNERABILITY","scope":"MAIN"}],"components":[{"key":"com.sonarsource:citytour2019-java:src/main/java/foo/security/injection/Servlet.java","uuid":"AW0p2QjJ-y65ELkujuRO","enabled":true,"qualifier":"FIL","name":"Servlet.java","longName":"src/main/java/foo/security/injection/Servlet.java","path":"src/main/java/foo/security/injection/Servlet.java"},{"key":"com.sonarsource:citytour2019-java","uuid":"AW0abn1qGHw5MqdAqloE","enabled":true,"qualifier":"TRK","name":"City Tour - Java project","longName":"City Tour - Java project"},{"key":"com.sonarsource:citytour2019-java:src/main/java/foo/security/injection/CommandInjectionVulnerability.java","uuid":"AW0p2QjJ-y65ELkujuRL","enabled":true,"qualifier":"FIL","name":"CommandInjectionVulnerability.java","longName":"src/main/java/foo/security/injection/CommandInjectionVulnerability.java","path":"src/main/java/foo/security/injection/CommandInjectionVulnerability.java"}],"rules":[{"key":"javasecurity:S2076","name":"OS commands should not be vulnerable to command injection attacks","lang":"java","status":"READY","langName":"Java"}],"users":[{"login":"jblievremont@github","name":"Jean-Baptiste Lièvremont","avatar":"b5007f5bd2e99d6c46d9106ccb5685e2","active":true}],"languages":[{"key":"css","name":"CSS"},{"key":"plsql","name":"PL/SQL"},{"key":"scala","name":"Scala"},{"key":"cs","name":"C#"},{"key":"java","name":"Java"},{"key":"web","name":"HTML"},{"key":"jsp","name":"JSP"},{"key":"xml","name":"XML"},{"key":"flex","name":"Flex"},{"key":"vbnet","name":"VB.NET"},{"key":"swift","name":"Swift"},{"key":"py","name":"Python"},{"key":"c","name":"C"},{"key":"cpp","name":"C++"},{"key":"objc","name":"Objective-C"},{"key":"go","name":"Go"},{"key":"kotlin","name":"Kotlin"},{"key":"rpg","name":"RPG"},{"key":"tsql","name":"T-SQL"},{"key":"pli","name":"PL/I"},{"key":"vb","name":"Vb"},{"key":"apex","name":"Apex"},{"key":"js","name":"JavaScript"},{"key":"ts","name":"TypeScript"},{"key":"ruby","name":"Ruby"},{"key":"cobol","name":"COBOL"},{"key":"php","name":"PHP"},{"key":"abap","name":"ABAP"}],"facets":[]}`;
const issuesResponse = JSON.parse(issuesJson);
const locations = issuesResponse.issues[0].flows[0].locations;
const components = issuesResponse.components;

const secondaryLocationDecorations = vscode.window.createTextEditorDecorationType({
  backgroundColor: '#fcc',
  before: {
    backgroundColor: '#c66',
    color: 'white',
    fontWeight: 'bold',
    margin: '0.1em'
  },
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});

export default function showExperimentalLocations() {

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  console.log(document.uri);
  const matchingComponent = components.find(c => document.uri.path.endsWith(c.path));
  console.log(matchingComponent);
  if(matchingComponent) {
    const decorationOptions = locations.filter(l => l.component === matchingComponent.key)
      .map((l, idx) =>({
        range: new vscode.Range(
          new vscode.Position(l.textRange.startLine - 1, l.textRange.startOffset),
          new vscode.Position(l.textRange.endLine - 1, l.textRange.endOffset)
        ),
        hoverMessage: l.msg,
        renderOptions: {
          before: {
            contentText: ` ${idx + 1} `
          }
        } as vscode.DecorationRenderOptions
      } as vscode.DecorationOptions));
    console.log(secondaryLocationDecorations.key);
    console.log(decorationOptions);
    editor.setDecorations(secondaryLocationDecorations, decorationOptions);
  }
}
