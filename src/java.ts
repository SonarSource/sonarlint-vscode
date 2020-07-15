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
let serverModeListener: Disposable;
let javaApiTooLowAlreadyLogged = false;
let javaServerInLightWeightModeAlreadyLogged = false;

/**
 * Possible startup modes for the Java extension's language server
 * See https://github.com/redhat-developer/vscode-java/blob/5642bf24b89202acf3911fe7a162b6dbcbeea405/src/settings.ts#L198
 */ 
enum ServerMode {
  STANDARD = 'Standard',
  LIGHTWEIGHT = 'LightWeight',
  HYBRID = 'Hybrid'
}

export function installClasspathListener(languageClient: SonarLintExtendedLanguageClient) {
  const extension: VSCode.Extension<any> | undefined = getJavaExtension();
  if (extension?.isActive) {
    if (!classpathChangeListener) {
      const extensionApi: any = extension.exports;
      if (extensionApi && isJavaApiRecentEnough(extensionApi.apiVersion)) {
        const onDidClasspathUpdate: VSCode.Event<VSCode.Uri> = extensionApi.onDidClasspathUpdate;
        classpathChangeListener = onDidClasspathUpdate(function(uri) {
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

export function installServerModeListener() {
  const extension: VSCode.Extension<any> | undefined = getJavaExtension();
  if (extension?.isActive) {
    if (!serverModeListener) {
      const extensionApi: any = extension.exports;
      if (extensionApi && isJavaApiRecentEnough(extensionApi.apiVersion) && extensionApi.onDidServerModeChange) {
        const onDidServerModeChange: VSCode.Event<ServerMode> = extensionApi.onDidServerModeChange;
        serverModeListener = onDidServerModeChange(function(serverMode) {
          if(serverMode !== ServerMode.LIGHTWEIGHT) {
            // Reset state of LightWeight mode warning
            javaServerInLightWeightModeAlreadyLogged = false;
          }
        });
      }
    }
  } else {
    if (serverModeListener) {
      serverModeListener.dispose();
      serverModeListener = null;
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
  const extension: VSCode.Extension<any> | undefined = getJavaExtension();
  try {
    const extensionApi: any = await extension?.activate();
    if (extensionApi && isJavaApiRecentEnough(extensionApi.apiVersion)) {
      installClasspathListener(languageClient);
      if (extensionApi.serverMode === ServerMode.LIGHTWEIGHT) {
        return javaConfigDisabledInLightWeightMode();
      }
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

function javaConfigDisabledInLightWeightMode() {
  if (!javaServerInLightWeightModeAlreadyLogged) {
    logToSonarLintOutput(
      `Java analysis is disabled in LightWeight mode. Please check java.server.launchMode in user settings`
    );
    javaServerInLightWeightModeAlreadyLogged = true;
  }
  return null;
}

function getJavaExtension() {
  return VSCode.extensions.getExtension('redhat.java');
}
