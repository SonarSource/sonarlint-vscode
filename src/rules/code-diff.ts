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
const DATA_DIFF_ID = 'data-diff-id';
const DATA_DIFF_TYPE = 'data-diff-type';
const PARENT_PRE_TAG_CLASS = 'code-difference-scrollable';
const CODE_DIFF_CONTAINER_CLASS = 'code-difference-container';
const CODE_ADDED_CLASS = 'code-added';
const CODE_REMOVED_CLASS = 'code-removed';
const CODE_DIFF_GENERAL_CLASS = 'code-diff';

function replaceInDom(current: HTMLElement, code: string) {
  const markedCode = new HTMLElement('pre', { class: PARENT_PRE_TAG_CLASS }, '', current, null);
  const flexDiv = new HTMLElement('div', { class: CODE_DIFF_CONTAINER_CLASS }, '', current, null);
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
      compliantCode += `<div class='${CODE_DIFF_GENERAL_CLASS} ${CODE_ADDED_CLASS}'>${hunk.value}</div>`;
    }

    if (hunk.removed) {
      nonCompliantCode += `<div class='${CODE_DIFF_GENERAL_CLASS} ${CODE_REMOVED_CLASS}'>${hunk.value}</div>`;
    }
  });
  return [nonCompliantCode, compliantCode];
}

export function getExamplesFromDom(document) {
  const pres = document.querySelectorAll(`pre[data-diff-id]`);

  return (
    Object.values(
      groupBy(
        pres.filter(e => e.getAttribute(DATA_DIFF_ID) !== undefined),
        e => e.getAttribute(DATA_DIFF_ID)
      )
    )
      // If we have 1 or 3+ example we can't display any differences
      .filter((diffsBlock: HTMLElement[]) => diffsBlock.length === NUMBER_OF_EXAMPLES)
      .map(diffBlock => keyBy(diffBlock, block => block.getAttribute(DATA_DIFF_TYPE)))
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
