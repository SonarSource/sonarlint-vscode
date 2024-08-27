/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2024 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { HTMLElement, parse } from 'node-html-parser';
import hljs from 'highlight.js';
import { logToSonarLintOutput } from '../util/logging';

function getNonDiffCodeSnippetsToHighlight(doc: HTMLElement) {
  return doc.querySelectorAll(`pre:not(.code-difference-scrollable)`);
}

function getDiffedCodeSnippetsToHighlight(doc: HTMLElement) {
  return doc.querySelectorAll(`pre.code-difference-scrollable`);
}

export function sonarToHighlightJsLanguageKeyMapping(sonarLanguageKey: string): string {
  switch (sonarLanguageKey) {
    case 'web':
      return 'html';
    case 'secrets':
      return 'markdown';
    case 'cloudformation':
    case 'kubernetes':
      return 'yaml';
    case 'ipynb':
      return 'python';
    case 'plsql':
    case 'tsql':
      return 'sql';
    default:
      return sonarLanguageKey;
  }
}

export function highlightAllCodeSnippetsInDesc(htmlDescription: string, ruleLanguageKey: string, diffed: boolean) {
  const doc = parse(htmlDescription);
  const preTagsNoDiff = getNonDiffCodeSnippetsToHighlight(doc);
  const languageKey = sonarToHighlightJsLanguageKeyMapping(ruleLanguageKey);

  try {
    preTagsNoDiff.forEach(pre => {
      const highlightedCode = hljs.highlight(pre.textContent, { language: languageKey, ignoreIllegals: true });
      pre.innerHTML = highlightedCode.value;
      return pre;
    });

    if (diffed) {
      const preTagsWithDiff = getDiffedCodeSnippetsToHighlight(doc);
      let realContainer: HTMLElement;
      preTagsWithDiff.forEach(pre => {
        const codeDiffContainer = parse(
          parse(pre.firstChild?.toString() || '').querySelectorAll('div.code-difference-container').toString()
        );
        codeDiffContainer.querySelectorAll('div').forEach((div, index) => {
          if (index === 0) {
            realContainer = div;
            return;
          }
          const newDiv = new HTMLElement('div', div.attrs, '', codeDiffContainer, undefined);
          newDiv.textContent = div.textContent;
          const highlightedCode = hljs.highlight(newDiv.textContent, {
            language: languageKey,
            ignoreIllegals: true
          });
          newDiv.innerHTML = highlightedCode.value;
          div.remove();
          realContainer.appendChild(newDiv);
        });
        pre.appendChild(realContainer);
        if (pre.firstChild) {
          pre.removeChild(pre.firstChild);
        }
      });
    }
  } catch (e) {
    logToSonarLintOutput(
      `Error occurred when rendering rule description. Rendering without syntax highlighting. \n ${(e as Error).message}`
    );
  }

  return doc.toString();
}
