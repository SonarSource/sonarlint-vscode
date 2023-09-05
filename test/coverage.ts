/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');

export function instrument() {
  const iLibInstrument = require('istanbul-lib-instrument');

  const instrumenter = iLibInstrument.createInstrumenter();
  const files = rreaddir(path.resolve(REPO_ROOT, 'out'));
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (/\.js\.map$/.test(file)) {
      //console.log(`ignoring ${file}`);
      continue;
    }

    const inputPath = path.resolve(REPO_ROOT, 'out', files[i]);
    const outputPath = path.resolve(REPO_ROOT, 'out-cov', files[i]);

    if (!/\.js$/.test(file) || /(^|[\\/])test[\\/]/.test(file)) {
      //console.log(`copying ${inputPath}`);
      copyFile(inputPath, outputPath);
      continue;
    }

    // Try to find a .map file
    let map = null;
    try {
      map = JSON.parse(fs.readFileSync(`${inputPath}.map`).toString());
    } catch (err) {
      // missing source map...
    }

    //console.log(`instrumenting ${inputPath}...`);
    const instrumentedCode = instrumenter.instrumentSync(fs.readFileSync(inputPath).toString(), inputPath, map);
    safeWriteFile(outputPath, instrumentedCode);
  }
}

export async function createReport(): Promise<void> {
  const iLibCoverage = require('istanbul-lib-coverage');
  const iLibSourceMaps = require('istanbul-lib-source-maps');
  const iLibReport = require('istanbul-lib-report');
  const iReports = require('istanbul-reports');

  const global = new Function('return this')();

  const mapStore = iLibSourceMaps.createSourceMapStore({});
  const coverageMap = iLibCoverage.createCoverageMap(global.__coverage__);
  const transformed = await mapStore.transformCoverage(coverageMap);

  const context = iLibReport.createContext({
    dir: path.resolve(REPO_ROOT, `coverage`),
    coverageMap: transformed,
    defaultSummarizer: 'flat'
  });
  const tree = context.getTree('flat');

  const reports = [iReports.create('lcov')];
  reports.forEach(report => tree.visit(report, context));
}

function copyFile(inputPath: string, outputPath: string): void {
  safeWriteFile(outputPath, fs.readFileSync(inputPath));
}

function safeWriteFile(filePath: string, contents: Buffer | string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, contents);
}

function ensureDir(dirname: string): void {
  if (fs.existsSync(dirname)) {
    return;
  }
  ensureDir(path.dirname(dirname));
  fs.mkdirSync(dirname);
}

function rreaddir(dirname: string): string[] {
  const result: string[] = [];
  _rreaddir(dirname, dirname, result);
  return result;
}

function _rreaddir(dirname: string, relativeTo: string, result: string[]): void {
  const entries = fs.readdirSync(dirname);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const entryPath = path.join(dirname, entry);
    if (fs.statSync(entryPath).isDirectory()) {
      _rreaddir(entryPath, relativeTo, result);
    } else {
      result.push(path.relative(relativeTo, entryPath));
    }
  }
}
