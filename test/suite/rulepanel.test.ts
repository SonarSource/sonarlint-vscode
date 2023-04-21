/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import {
  computeHeading,
  renderHotspotBanner,
  renderRuleDescription,
  renderRuleParams,
  renderTaintBanner
} from '../../src/rules/rulepanel';

suite('rulepanel', () => {
  test('should render monolithic description if there are no tabs', () => {
    expect(
      renderRuleDescription({
        htmlDescriptionTabs: [],
        isTaint: false,
        key: '',
        name: '',
        severity: '',
        type: '',
        languageKey: '',
        htmlDescription: 'monolithicDescription'
      })
    ).to.equal('<div class="rule-desc">monolithicDescription</div>');
  });

  test('should render tabs description with correct context tab being checked', () => {
    let htmlResult = renderRuleDescription({
      htmlDescriptionTabs: [
        {
          title: 'Title',
          ruleDescriptionTabNonContextual: null,
          hasContextualInformation: true,
          defaultContextKey: 'jsp',
          ruleDescriptionTabContextual: [
            {
              htmlContent: '<p>context 1</p>',
              contextKey: 'servlet',
              displayName: 'Servlet'
            },
            {
              htmlContent: '<p>context 2</p>',
              contextKey: 'jsp',
              displayName: 'JSP'
            }
          ]
        }
      ],
      isTaint: true,
      key: '',
      name: '',
      severity: '',
      languageKey: '',
      type: '',
      htmlDescription: 'contextualDescription'
    });
    let inlineHtmlResult = htmlResult.replace(/(\r\n|\n|\r)/gm, "");
    expect(inlineHtmlResult).to.match(
      new RegExp('.*<input type="radio" name="tabs".*class="contextualTab" checked="checked">' +
        '              <label for="context-1" class="contextLabel">JSP</label>.*'));
  });

  test('should correctly compute heading', () => {
    const tab = {
      title: 'How can I fix this?'
    };
    const contextualDescription = {
      contextKey: 'servlet',
      displayName: 'Servlet'
    };
    expect(computeHeading(tab, contextualDescription)).to.equal('How can I fix this in Servlet');

    const otherContextDescription = {
      contextKey: 'others',
      displayName: 'Others'
    };
    expect(computeHeading(tab, otherContextDescription)).to.equal('');
  });

  test('should render empty rule params', () => {
    expect(
      renderRuleParams({
        htmlDescriptionTabs: [],
        isTaint: false,
        key: '',
        name: '',
        severity: '',
        languageKey: '',
        type: '',
        htmlDescription: ''
      })
    ).to.be.empty;
    expect(
      renderRuleParams({
        htmlDescriptionTabs: [],
        isTaint: false,
        key: '',
        name: '',
        severity: '',
        type: '',
        languageKey: '',
        htmlDescription: '',
        parameters: []
      })
    ).to.be.empty;
  });

  test('should render rule params', () => {
    expect(
      renderRuleParams({
        htmlDescriptionTabs: [],
        isTaint: false,
        key: '',
        name: '',
        severity: '',
        type: '',
        languageKey: '',
        htmlDescription: '',
        parameters: [
          {
            name: 'name',
            description: 'desc',
            defaultValue: 'value'
          }
        ]
      })
    ).to.be.not.empty;
  });

  test('should not render hotspot banner for not hotspot rules', () => {
    expect(
      renderHotspotBanner(
        {
          htmlDescriptionTabs: [],
          isTaint: false,
          key: '',
          name: '',
          severity: '',
          type: 'NOT A HOTSPOT',
          languageKey: '',
          htmlDescription: ''
        },
        ''
      )
    ).to.be.empty;
  });

  test('should render hotspot banner for hotspot rules', () => {
    expect(
      renderHotspotBanner(
        {
          htmlDescriptionTabs: [],
          isTaint: false,
          key: '',
          name: '',
          severity: '',
          languageKey: '',
          type: 'SECURITY_HOTSPOT',
          htmlDescription: ''
        },
        ''
      )
    ).to.be.not.empty;
  });

  test('should not render taint banner for not taint rules', () => {
    expect(
      renderTaintBanner(
        {
          htmlDescriptionTabs: [],
          isTaint: false,
          key: '',
          name: '',
          severity: '',
          languageKey: '',
          type: '',
          htmlDescription: ''
        },
        ''
      )
    ).to.be.empty;
  });

  test('should render hotspot banner for hotspot rules', () => {
    expect(
      renderTaintBanner(
        {
          htmlDescriptionTabs: [],
          isTaint: true,
          key: '',
          name: '',
          severity: '',
          languageKey: '',
          type: '',
          htmlDescription: ''
        },
        ''
      )
    ).to.be.not.empty;
  });
});
