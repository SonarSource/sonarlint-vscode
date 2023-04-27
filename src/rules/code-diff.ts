/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { HTMLElement, parse } from 'node-html-parser';
import { groupBy, keyBy } from 'lodash';
import { diffLines } from 'diff';
const NUMBER_OF_EXAMPLES = 2;

function replaceInDom(current: HTMLElement, code: string) {
  const markedCode = new HTMLElement('pre', { class: 'code-difference-scrollable' }, '', current, null);
  const flexDiv = new HTMLElement('div', { class: 'code-difference-container' }, '', current, null);
  flexDiv.innerHTML = code;
  markedCode.appendChild(flexDiv);
  current.replaceWith(markedCode);
}

export function differentiateCode(compliant: string, nonCompliant: string) {
  const hunks = diffLines(compliant, nonCompliant);

  let nonCompliantCode = '';
  let compliantCode = '';

  hunks.forEach(hunk => {
    if (!hunk.added && !hunk.removed) {
      nonCompliantCode += `<div>${hunk.value}</div>`;
      compliantCode += `<div>${hunk.value}</div>`;
    }

    if (hunk.added) {
      compliantCode += `<div class='code-added'>${hunk.value}</div>`;
    }

    if (hunk.removed) {
      nonCompliantCode += `<div class='code-removed'>${hunk.value}</div>`;
    }
  });
  return [nonCompliantCode, compliantCode];
}

export function getExamplesFromDom(document) {
  const pres = document.querySelectorAll(`pre[data-diff-id]`);

  return (
    Object.values(
      groupBy(
        pres.filter(e => e.getAttribute('data-diff-id') !== undefined),
        e => e.getAttribute('data-diff-id')
      )
    )
      // If we have 1 or 3+ example we can't display any differences
      .filter((diffsBlock: HTMLElement[]) => diffsBlock.length === NUMBER_OF_EXAMPLES)
      .map(diffBlock => keyBy(diffBlock, block => block.getAttribute('data-diff-type')))
  );
}

export function decorateContextualHtmlContentWithDiff(htmlContent) {
  const doc = parse(htmlContent);
  const codeExamples = getExamplesFromDom(doc);

  codeExamples.forEach(({ noncompliant, compliant }) => {
    if (noncompliant === undefined || compliant === undefined) {
      return;
    }
    const [markedNonCompliant, markedCompliantCode] = differentiateCode(noncompliant.innerHTML, compliant.innerHTML);

    replaceInDom(noncompliant, markedNonCompliant);
    replaceInDom(compliant, markedCompliantCode);
  });

  return doc.toString();
}
