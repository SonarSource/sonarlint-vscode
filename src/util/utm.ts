/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

const DEFAULT_MEDIUM = 'referral';
const DEFAULT_SOURCE = 'sq-ide-product-vscode';

export interface Utm {
  content: string;
  term: string;
}

export function addUtmIfNeeded(baseUrl: string, utm?: Utm) {
  if (utm !== undefined) {
    const { content, term } = utm;
    return addUtmParameters(baseUrl, content, term);
  }
  return baseUrl;
}

function addUtmParameters(baseUrl: string, content: string, term: string) {
  const parsed = new URL(baseUrl);
  parsed.searchParams.set('utm_medium' , DEFAULT_MEDIUM);
  parsed.searchParams.set('utm_source' , DEFAULT_SOURCE);
  parsed.searchParams.set('utm_content', content);
  parsed.searchParams.set('utm_term'   , term);
  return parsed.toString();
}
