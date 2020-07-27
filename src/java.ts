/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2020 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import * as VSCode from 'vscode';
import { Disposable } from 'vscode-languageclient';
import * as CompareVersions from 'compare-versions';

import { logToSonarLintOutput } from './extension';
import { GetJavaConfigResponse } from './protocol';
import { SonarLintExtendedLanguageClient } from './client';

let classpathChangeListener: Disposable;
let javaApiTooLowAlreadyLogged = false;

export function installClasspathListener(languageClient: SonarLintExtendedLanguageClient) {
  const extension: VSCode.Extension<any> | undefined = VSCode.extensions.getExtension('redhat.java');
  if (extension?.isActive) {
    if (!classpathChangeListener) {
      const extensionApi: any = extension.exports;
      if (extensionApi && isJavaApiRecentEnough(extensionApi.apiVersion)) {
        var onDidClasspathUpdate: VSCode.Event<VSCode.Uri> = extensionApi.onDidClasspathUpdate;
        classpathChangeListener = onDidClasspathUpdate(function (uri) {
          languageClient.onReady().then(() => languageClient.didClasspathUpdate(uri.toString()));
        });
      }
    }
  } else {
    if (classpathChangeListener) {
      classpathChangeListener.dispose();
      classpathChangeListener = null;
    }
  }
}

function isJavaApiRecentEnough(apiVersion: string): boolean {
  if (CompareVersions.compare(apiVersion, '0.4', '>=')) {
    return true;
  }
  if (!javaApiTooLowAlreadyLogged) {
    logToSonarLintOutput(`SonarLint requires VSCode Java extension 0.56 or greater to enable analysis of Java files`);
    javaApiTooLowAlreadyLogged = true;
  }
  return false;
}

export async function getJavaConfig(
  languageClient: SonarLintExtendedLanguageClient,
  fileUri: string
): Promise<GetJavaConfigResponse> {
  const extension: VSCode.Extension<any> | undefined = VSCode.extensions.getExtension('redhat.java');
  try {
    const extensionApi: any = await extension?.activate();
    if (extensionApi && isJavaApiRecentEnough(extensionApi.apiVersion)) {
      installClasspathListener(languageClient);
      const isTest: boolean = await extensionApi.isTestFile(fileUri);
      const sourceLevel: string = (
        await extensionApi.getProjectSettings(fileUri, ['org.eclipse.jdt.core.compiler.compliance'])
      )['org.eclipse.jdt.core.compiler.compliance'];
      const classpathResult = await extensionApi.getClasspaths(fileUri, { scope: isTest ? 'test' : 'runtime' });
      return {
        projectRoot: classpathResult.projectRoot,
        sourceLevel,
        classpath: classpathResult.classpaths,
        isTest
      };
    }
  } catch (error) {
    console.error(error);
  }
  return null;
}
