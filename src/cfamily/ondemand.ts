/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as fs from 'fs';
import * as openpgp from 'openpgp';
import * as path from 'path';
import * as vscode from 'vscode';
import * as util from '../util/util';

const CFAMILY_PLUGIN_ID = 'sonar-cfamily-plugin';
const CFAMILY_JAR = 'sonarcfamily.jar';

export function maybeAddCFamilyJar(params: string[]) {
  const expectedVersion: string = util.packageJson.jarDependencies.filter(dep => dep.artifactId === CFAMILY_PLUGIN_ID)[0].version;
  const onDemandAnalyzersPath = path.resolve(util.extensionPath, '..', 'sonarsource.sonarlint_ondemand-analyzers');
  const maybeCFamilyJar = path.resolve(onDemandAnalyzersPath, CFAMILY_PLUGIN_ID, expectedVersion, CFAMILY_JAR);
  if (fs.existsSync(maybeCFamilyJar)) {
    params.push(maybeCFamilyJar);
  } else {
    // Async call is expected here
    startDownloadAsync(onDemandAnalyzersPath, expectedVersion);
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

async function verifySignature(jarPath: string) {
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
    return false;
  }
}
