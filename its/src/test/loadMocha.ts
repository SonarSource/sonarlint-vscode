/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

/**
 * Load mocha with a real dynamic `import()`. TypeScript `module: commonjs` would rewrite
 * `import('mocha')` to `require()`, which fails on mocha 12 (ESM) under older Electron Node.
 */
export async function loadMocha(): Promise<typeof import('mocha')> {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string
  ) => Promise<{ default?: typeof import('mocha') } & typeof import('mocha')>;
  const mod = await dynamicImport('mocha');
  return mod.default ?? mod;
}
