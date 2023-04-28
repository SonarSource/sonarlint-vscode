import { parse } from 'node-html-parser';
import { expect } from 'chai';
import * as assert from 'assert';
import {
  decorateContextualHtmlContentWithDiff,
  differentiateCode,
  getExamplesFromDom
} from '../../src/rules/code-diff';

suite('Code diff', () => {
  suite('getExamplesFromDom()', () => {
    test('Should get single code example pair from DOM', () => {
      const testHtmlString =
        '<p>The following code is vulnerable to Session Cookie Injection as it assigns a session cookie using untrusted data.</p>\n' +
        '<h4>Noncompliant code example</h4>\n' +
        '<pre data-diff-id="1" data-diff-type="noncompliant">\n' +
        'protected void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException {\n' +
        '    Optional&lt;Cookie&gt; cookieOpt = Arrays.stream(request.getCookies())\n' +
        '                                    .filter(c -&gt; c.getName().equals("jsessionid"))\n' +
        '                                    .findFirst();\n' +
        '\n' +
        '    if (!cookieOpt.isPresent()) {\n' +
        '        String cookie = request.getParameter("cookie");\n' +
        '        Cookie cookieObj = new Cookie("jsessionid", cookie);\n' +
        '        response.addCookie(cookieObj);\n' +
        '    }\n' +
        '\n' +
        '    response.sendRedirect("/welcome.jsp");\n' +
        '}\n' +
        '</pre>\n' +
        '<h4>Compliant solution</h4>\n' +
        '<pre data-diff-id="1" data-diff-type="compliant">\n' +
        'protected void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException {\n' +
        '    Optional&lt;Cookie&gt; cookieOpt = Arrays.stream(request.getCookies())\n' +
        '                                    .filter(c -&gt; c.getName().equals("jsessionid"))\n' +
        '                                    .findFirst();\n' +
        '\n' +
        '    if (!cookieOpt.isPresent()) {\n' +
        '        response.sendRedirect("/getCookie.jsp");\n' +
        '    } else {\n' +
        '        response.sendRedirect("/welcome.jsp");\n' +
        '    }\n' +
        '}\n' +
        '</pre>\n' +
        '<h3>How does this work?</h3>\n' +
        '<p>Untrusted data, such as GET or POST request content, should always be considered tainted. Therefore, an application should not blindly assign the\n' +
        'value of a session cookie to untrusted data.</p>\n' +
        '<p>Session cookies should be generated using the built-in APIs of secure libraries that include session management instead of developing homemade\n' +
        'tools.<br> Often, these existing solutions benefit from quality maintenance in terms of features, security, or hardening, and it is usually better to\n' +
        'use these solutions than to develop your own.</p>';

      const doc = parse(testHtmlString);

      expect(getExamplesFromDom(doc)).to.have.length(1);
    });
    test('Should get 3 pairs of code examples from DOM', () => {
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
        '<h4>Compliant solution</h4>\n' +
        '<pre data-diff-id="2" data-diff-type="compliant">\n' +
        '  void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException\n' +
        '</pre>\n' +
        '<pre data-diff-id="3" data-diff-type="noncompliant">\n' +
        'void doGet(HttpServletRequest request, HttpServletResponse response)\n' +
        '</pre>\n' +
        '<h4>Compliant solution</h4>\n' +
        '<pre data-diff-id="3" data-diff-type="compliant">\n' +
        '  void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException\n' +
        '</pre>\n' +
        '<pre>\n' +
        '  void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException\n' +
        '</pre>\n' +
        '<h3>How does this work?</h3>\n' +
        '<p>Untrusted data, such as GET or POST request content</p>\n' +
        '<p>Session cookies should be generated using the built-in APIs</p>';

      const doc = parse(testHtmlString);

      expect(getExamplesFromDom(doc)).to.have.length(3);
    });
    test('Should return empty list when there are no diff snippets', () => {
      const testHtml =
        '<p>The following code is vulnerable to Session Cookie Injection as it assigns a session cookie using untrusted data.</p>\n' +
        '<h4>Noncompliant code example</h4>\n' +
        '<pre>\n' +
        '  void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException\n' +
        '</pre>\n' +
        '<h3>How does this work?</h3>\n' +
        '<p>Untrusted data, such as GET or POST request content</p>\n' +
        '<p>Session cookies should be generated using the built-in APIs</p>';

      const doc = parse(testHtml);

      expect(getExamplesFromDom(doc)).to.be.empty;
    });
  });
  suite('differentiateCode', () => {
    test('Should return compliant and noncompliant code examples with diff', () => {
      const compliant = 'aaa\n' + 'bbb\n' + 'ccc\n';
      const noncompliant = 'aaa\n' + 'ddd\n' + 'ccc\n';

      const diffResult = differentiateCode(compliant, noncompliant);
      const expectedResult = [
        "<div>aaa\n</div><div class='code-diff code-removed'>bbb\n</div><div>ccc\n</div>",
        "<div>aaa\n</div><div class='code-diff code-added'>ddd\n</div><div>ccc\n</div>"
      ];

      expect(diffResult[0]).to.equal(expectedResult[0]);
      expect(diffResult[1]).to.equal(expectedResult[1]);
      expect(diffResult.length).to.equal(expectedResult.length);
    });
    test('Should return list with same elements when there is no diff', () => {
      const compliant = 'aaa\n' + 'bbb\n' + 'ccc\n';
      const noncompliant = 'aaa\n' + 'bbb\n' + 'ccc\n';

      const diffResult = differentiateCode(compliant, noncompliant);
      const expectedResult = ['<div>aaa\nbbb\nccc\n</div>', '<div>aaa\nbbb\nccc\n</div>'];

      expect(diffResult[0]).to.equal(expectedResult[0]);
      expect(diffResult[1]).to.equal(expectedResult[1]);
      expect(diffResult.length).to.equal(expectedResult.length);
    });
  });
  suite('decorateContextualHtmlContentWithDiff()', () => {
    const testHtmlString =
      '<p>The following code is vulnerable to Session Cookie Injection as it assigns a session cookie using untrusted data.</p>\n' +
      '<h4>Noncompliant code example</h4>\n' +
      '<pre data-diff-id="1" data-diff-type="noncompliant">\n' +
      'aaa\n' +
      'bbb\n' +
      'ddd\n' +
      '</pre>\n' +
      '<h4>Compliant solution</h4>\n' +
      '<pre data-diff-id="1" data-diff-type="compliant">\n' +
      'aaa\n' +
      'bbb\n' +
      'ccc</pre>\n' +
      '<h3>How does this work?</h3>\n' +
      '<p>Untrusted data, suc session cookie to untrusted data.</p>\n' +
      '<p>Session .<br> Often</p>';

    const expectedResult =
      '<p>The following code is vulnerable to Session Cookie Injection as it assigns a session cookie using untrusted data.</p>\n' +
      '<h4>Noncompliant code example</h4>\n' +
      '<pre class="code-difference-scrollable"><div class="code-difference-container"><div>\n' +
      'aaa\n' +
      'bbb\n' +
      "</div><div class='code-diff code-removed'>ddd\n" +
      '</div></div></pre>\n' +
      '<h4>Compliant solution</h4>\n' +
      '<pre class="code-difference-scrollable"><div class="code-difference-container"><div>\n' +
      'aaa\n' +
      'bbb\n' +
      "</div><div class='code-diff code-added'>ccc</div></div></pre>\n" +
      '<h3>How does this work?</h3>\n' +
      '<p>Untrusted data, suc session cookie to untrusted data.</p>\n' +
      '<p>Session .<br> Often</p>';

    const actualResult = decorateContextualHtmlContentWithDiff(testHtmlString);
    expect(actualResult).to.be.a('string');
    expect(expectedResult).to.be.a('string');
    assert.strictEqual(actualResult, expectedResult);
  });
});
