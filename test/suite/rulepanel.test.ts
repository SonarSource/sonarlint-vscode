/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import {
  renderHotspotBanner,
  renderRuleDescription,
  renderRuleParams,
  renderTaintBanner
} from "../../src/rules/rulepanel";

suite('rulepanel', () => {


  test('should render monolithic description if there are no tabs', () => {
    expect(renderRuleDescription({
      htmlDescriptionTabs: [],
      isTaint: false,
      key: "",
      name: "",
      severity: "",
      type: "",
      htmlDescription: 'monolithicDescription'})).to.equal('<div class="rule-desc">monolithicDescription</div>');
  });
  // test('should render tabs description', () => {
  //   expect(renderRuleDescription({
  //     htmlDescriptionTabs: [{title: 'Title', description: 'desc'}],
  //     isTaint: false,
  //     key: "",
  //     name: "",
  //     severity: "",
  //     type: "",
  //     htmlDescription: 'monolithicDescription'})).to.contain('<main class="tabs">')
  // });

  test('should render empty rule params', () => {
    expect(renderRuleParams({
      htmlDescriptionTabs: [],
      isTaint: false,
      key: "",
      name: "",
      severity: "",
      type: "",
      htmlDescription: ''})).to.be.empty;
    expect(renderRuleParams({
      htmlDescriptionTabs: [],
      isTaint: false,
      key: "",
      name: "",
      severity: "",
      type: "",
      htmlDescription: '',
      parameters: []})).to.be.empty;
  });

  test('should render rule params', () => {
    expect(renderRuleParams({
      htmlDescriptionTabs: [],
      isTaint: false,
      key: "",
      name: "",
      severity: "",
      type: "",
      htmlDescription: '',
      parameters: [{
        name: 'name',
        description: 'desc',
        defaultValue: 'value'
      }]})).to.be.not.empty;
  });

  test('should not render hotspot banner for not hotspot rules', () => {
    expect(renderHotspotBanner({
      htmlDescriptionTabs: [],
      isTaint: false,
      key: "",
      name: "",
      severity: "",
      type: "NOT A HOTSPOT",
      htmlDescription: ''
    }, '')).to.be.empty;
  });

  test('should render hotspot banner for hotspot rules', () => {
    expect(renderHotspotBanner({
      htmlDescriptionTabs: [],
      isTaint: false,
      key: "",
      name: "",
      severity: "",
      type: "SECURITY_HOTSPOT",
      htmlDescription: ''
    }, '')).to.be.not.empty;
  });


  test('should not render taint banner for not taint rules', () => {
    expect(renderTaintBanner({
      htmlDescriptionTabs: [],
      isTaint: false,
      key: "",
      name: "",
      severity: "",
      type: "",
      htmlDescription: ''
    }, '')).to.be.empty;
  });

  test('should render hotspot banner for hotspot rules', () => {
    expect(renderTaintBanner({
      htmlDescriptionTabs: [],
      isTaint: true,
      key: "",
      name: "",
      severity: "",
      type: "",
      htmlDescription: ''
    }, '')).to.be.not.empty;
  });

});
