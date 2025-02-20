/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as fs from 'fs';
import fetch, { Response } from 'node-fetch';
import * as Progress from 'node-fetch-progress';
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
  const actuallyDownloaded = await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `Downloading ${CFAMILY_PLUGIN_ID} analyzer version ${expectedVersion}`,
    cancellable: true
  },  async (progress, cancelToken) => {
    const fetchAbort = new AbortController();
    cancelToken.onCancellationRequested(() => {
      fetchAbort.abort('Download canceled by user');
    });
    const url = `https://binaries.sonarsource.com/CommercialDistribution/${CFAMILY_PLUGIN_ID}/${CFAMILY_PLUGIN_ID}-${expectedVersion}.jar`;
    let fetchResult: Response;
    try {
      // On user cancel, AbortController.abort will throw an exception
      fetchResult = await fetch(url, {
        signal: fetchAbort.signal
      });
      followFetchProgress(fetchResult, progress);
      if (! fetchResult?.ok) {
        return false;
      }
    } catch (err) {
      return false;
    }

    const destinationDir = path.resolve(onDemandAnalyzersPath, CFAMILY_PLUGIN_ID, expectedVersion);
    fs.mkdirSync(destinationDir, { recursive: true });
    const jarPath = path.join(destinationDir, CFAMILY_JAR);
    fs.writeFileSync(jarPath, Buffer.from(await fetchResult.arrayBuffer()));
    return true;
  });

  if (actuallyDownloaded) {
    // TODO Validate signature!
    const restart = await vscode.window.showInformationMessage(
      `Downloaded ${CFAMILY_PLUGIN_ID} ${expectedVersion}, please reload the current window to activate it.`,
      'Restart'
    );
    if (restart === 'Restart') {
      vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  }
}

function followFetchProgress(fetchResult: Response, progress: Progress<{ message?: string; increment?: number }>) {
  const fetchProgress = new Progress(fetchResult, { throttle: 100 });
  let previousDone = 0;
  fetchProgress.on('progress', () => {
    const increment = (100 * (fetchProgress.done - previousDone)) / fetchProgress.total;
    previousDone = fetchProgress.done;
    progress.report({ message: 'Downloading', increment });
  });
  fetchProgress.on('finish', () => {
    progress.report({ message: 'Downloaded', increment: 1.0 });
  });
}
