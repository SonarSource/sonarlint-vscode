import { expect } from 'chai';
import { highlightAllCodeSnippetsInDesc, sonarToHighlightJsLanguageKeyMapping } from '../../src/rules/syntax-highlight';
import * as assert from 'assert';

suite('Syntax Highlighting', () => {
  test('sonarToHighlightJsLanguageKeyMapping()', () => {
    expect(sonarToHighlightJsLanguageKeyMapping('web')).to.equal('html');
    expect(sonarToHighlightJsLanguageKeyMapping('secrets')).to.equal('markdown');
    expect(sonarToHighlightJsLanguageKeyMapping('cloudformation')).to.equal('yaml');
    expect(sonarToHighlightJsLanguageKeyMapping('ipynb')).to.equal('python');
    expect(sonarToHighlightJsLanguageKeyMapping('kubernetes')).to.equal('yaml');
    expect(sonarToHighlightJsLanguageKeyMapping('terraform')).to.equal('terraform');
    expect(sonarToHighlightJsLanguageKeyMapping('java')).to.equal('java');
    expect(sonarToHighlightJsLanguageKeyMapping('foo')).to.equal('foo');
  });
  test('Should highlight both diffed and regular pre tags', () => {
    const testHtmlString =
      '<p>The following code is vulnerable to Session Cookie Injection as it assigns a session cookie using untrusted data.</p>\n' +
      '<h4>Noncompliant code example</h4>\n' +
      '<pre data-diff-id="1" data-diff-type="noncompliant">\n' +
      'void doGet(HttpServletRequest request, HttpServletResponse response)\n' +
      '</pre>\n' +
      '<h4>Compliant solution</h4>\n' +
      '<pre data-diff-id="1" data-diff-type="compliant">\n' +
      '  void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException\n' +
      '</pre>\n' +
      '<pre data-diff-id="2" data-diff-type="noncompliant">\n' +
      'void doGet(HttpServletRequest request, HttpServletResponse response)\n' +
      '</pre>\n' +
      '<pre>\n' +
      '  void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException\n' +
      '</pre>\n' +
      '<h3>How does this work?</h3>\n' +
      '<p>Untrusted data, such as GET or POST request content</p>\n' +
      '<p>Session cookies should be generated using the built-in APIs</p>';

    const actualResult = highlightAllCodeSnippetsInDesc(testHtmlString, 'java', true);

    const expectedResult =
      '<p>The following code is vulnerable to Session Cookie Injection as it assigns a session cookie using untrusted data.</p>\n' +
      '<h4>Noncompliant code example</h4>\n' +
      '<pre data-diff-id="1" data-diff-type="noncompliant">\n' +
      '<span class="hljs-keyword">void</span> <span class="hljs-title function_">doGet</span><span class="hljs-params">(HttpServletRequest request, HttpServletResponse response)</span>\n' +
      '</pre>\n' +
      '<h4>Compliant solution</h4>\n' +
      '<pre data-diff-id="1" data-diff-type="compliant">\n' +
      '  <span class="hljs-keyword">void</span> <span class="hljs-title function_">doGet</span><span class="hljs-params">(HttpServletRequest request, HttpServletResponse response)</span> <span class="hljs-keyword">throws</span> IOException\n' +
      '</pre>\n' +
      '<pre data-diff-id="2" data-diff-type="noncompliant">\n' +
      '<span class="hljs-keyword">void</span> <span class="hljs-title function_">doGet</span><span class="hljs-params">(HttpServletRequest request, HttpServletResponse response)</span>\n' +
      '</pre>\n' +
      '<pre>\n' +
      '  <span class="hljs-keyword">void</span> <span class="hljs-title function_">doGet</span><span class="hljs-params">(HttpServletRequest request, HttpServletResponse response)</span> <span class="hljs-keyword">throws</span> IOException\n' +
      '</pre>\n' +
      '<h3>How does this work?</h3>\n' +
      '<p>Untrusted data, such as GET or POST request content</p>\n' +
      '<p>Session cookies should be generated using the built-in APIs</p>';

    assert.strictEqual(actualResult, expectedResult);
  });
});
