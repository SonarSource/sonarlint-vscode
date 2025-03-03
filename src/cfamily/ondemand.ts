/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as fs from 'fs';
import { DateTime } from 'luxon';
import * as openpgp from 'openpgp';
import * as path from 'path';
import * as vscode from 'vscode';

import { MonitoringService } from '../monitoring/monitoring';
import * as util from '../util/util';
import { logToSonarLintOutput } from '../util/logging';

// Comparing a `DateTime` in the past with `diffNow` returns a negative number
const PLUGIN_MAX_AGE_MONTHS = -2;

const CFAMILY_PLUGIN_ID = 'sonar-cfamily-plugin';
const CFAMILY_JAR = 'sonarcfamily.jar';

function getOnDemandAnalyzersPath() {
  return path.resolve(util.extensionPath, '..', 'sonarsource.sonarlint_ondemand-analyzers');
}

export async function maybeAddCFamilyJar(params: string[]) {
  const expectedVersion: string = util.packageJson.jarDependencies.filter(dep => dep.artifactId === CFAMILY_PLUGIN_ID)[0].version;
  const maybeCFamilyJar = path.resolve(getOnDemandAnalyzersPath(), CFAMILY_PLUGIN_ID, expectedVersion, CFAMILY_JAR);
  if (fs.existsSync(maybeCFamilyJar)) {
    params.push(maybeCFamilyJar);
    await util.extensionContext.globalState.update(lastUsedKey(CFAMILY_PLUGIN_ID, expectedVersion), DateTime.now().toMillis());
    cleanupOldAnalyzersAsync();
  } else {
    // Async call is expected here
    startDownloadAsync(getOnDemandAnalyzersPath(), expectedVersion);
  }
}

async function startDownloadAsync(onDemandAnalyzersPath: string, expectedVersion: string) {

  const destinationDir = path.resolve(onDemandAnalyzersPath, CFAMILY_PLUGIN_ID, expectedVersion);
  const jarPath = path.join(destinationDir, CFAMILY_JAR);

  let errorMessage = '';
  const actuallyDownloaded = await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `Downloading ${CFAMILY_PLUGIN_ID} analyzer version ${expectedVersion}`,
    cancellable: true
  },  async (progress, cancelToken) => {
    const fetchAbort = new AbortController();
    cancelToken.onCancellationRequested(() => {
      errorMessage = 'Download aborted. Analysis of C and C++ is disabled in this IDE session.';
      fetchAbort.abort(errorMessage);
    });
    const url = `https://binaries.sonarsource.com/CommercialDistribution/${CFAMILY_PLUGIN_ID}/${CFAMILY_PLUGIN_ID}-${expectedVersion}.jar`;
    let fetchResult: Response;
    try {
      // On user cancel, AbortController.abort will throw an exception
      fetchResult = await fetch(url, {
        signal: fetchAbort.signal
      });
      if (! fetchResult?.ok) {
        errorMessage = fetchResult.statusText;
        return false;
      }
    } catch (err) {
      errorMessage = err.message;
      return false;
    }

    fs.mkdirSync(destinationDir, { recursive: true });
    fs.writeFileSync(jarPath, Buffer.from(await fetchResult.arrayBuffer()));

    progress.report({
      message: `Checking signature`
    });
    const validSignature = await verifySignature(jarPath);
    if (!validSignature) {
      errorMessage = 'SonarQube for IDE could not verify the authenticity of the downloaded file';
    }
    progress.report({
      message: `Signature is ${validSignature ? 'valid' : 'invalid'}`
    });

    return validSignature;
  });

  if (actuallyDownloaded) {
    const restart = await vscode.window.showInformationMessage(
      `Downloaded ${CFAMILY_PLUGIN_ID} ${expectedVersion}, please reload the current window to activate it.`,
      'Reload'
    );
    if (restart === 'Reload') {
      vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  } else {
    // Remove partial/invalid file to avoid issues at next start
    fs.rmSync(jarPath, { force: true });
    vscode.window.showErrorMessage(errorMessage);
  }
}

export async function verifySignature(jarPath: string) {
  const armoredKey = fs.readFileSync(path.join(util.extensionPath, 'sonarsource-public.key'), { encoding: 'ascii'});
  const verificationKey = await openpgp.readKey({ armoredKey });
  const armoredSignature = fs.readFileSync(path.join(util.extensionPath, 'analyzers', 'sonarcfamily.jar.asc'), { encoding: 'ascii' });
  const signature = await openpgp.readSignature({ armoredSignature });
  const binary = fs.readFileSync(jarPath);
  const message = await openpgp.createMessage({ binary });
  const verificationResult = await openpgp.verify({
    message,
    format: 'binary',
    verificationKeys: [ verificationKey ],
    signature
  });
  for (const _ of verificationResult.data) { /* Iterate over the binary buffer to trigger verification */ }
  try {
    return await verificationResult.signatures[0].verified;
  } catch (e) {
    logToSonarLintOutput(`Could not validate analyzer at ${jarPath}: ${e}`);
    MonitoringService.instance.captureException(e);
    return false;
  }
}

function lastUsedKey(pluginId: string, version: string) {
  return `plugins[${pluginId}][${version}].lastUsed`;
}

// Exported for tests
export async function cleanupOldAnalyzersAsync(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      fs.readdirSync(getOnDemandAnalyzersPath()).forEach(cleanupOldAnalyzerVersions);
      resolve();
    } catch (e) {
      if (e instanceof Error) {
        reject(e);
      } else {
        reject(new Error(e));
      }
    }
  });
}

function cleanupOldAnalyzerVersions(pluginId: string) {
  fs.readdirSync(path.resolve(getOnDemandAnalyzersPath(), pluginId)).forEach(cleanVersionIfUnused(pluginId));
}

function cleanVersionIfUnused(pluginId: string) {
  return (version: string) => {
    const lastUsedForThisPluginAndVersion = lastUsedKey(pluginId, version);
    const lastUsed = util.extensionContext.globalState.get<number>(lastUsedForThisPluginAndVersion);
    if (lastUsed) {
      const dateTimeLastUsed = DateTime.fromMillis(lastUsed);
      // Comparing a `DateTime` in the past with `diffNow` returns a negative number
      if (dateTimeLastUsed.diffNow('months').months <= PLUGIN_MAX_AGE_MONTHS) {
        fs.rmSync(path.resolve(getOnDemandAnalyzersPath(), pluginId, version), { recursive: true, force: true });
        util.extensionContext.globalState.update(lastUsedForThisPluginAndVersion, undefined);
      }
    }
  }
}
