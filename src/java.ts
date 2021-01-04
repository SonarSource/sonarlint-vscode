/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
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

/*
 Possible startup modes for the Java extension's language server
 See https://github.com/redhat-developer/vscode-java/blob/5642bf24b89202acf3911fe7a162b6dbcbeea405/src/settings.ts#L198
 */
export enum ServerMode {
  STANDARD = 'Standard',
  LIGHTWEIGHT = 'LightWeight',
  HYBRID = 'Hybrid'
}

export function installClasspathListener(languageClient: SonarLintExtendedLanguageClient) {
  const extension = getJavaExtension();
  if (extension?.isActive) {
    if (!classpathChangeListener) {
      const extensionApi = extension.exports;
      if (extensionApi && isJavaApiRecentEnough(extensionApi.apiVersion)) {
        const onDidClasspathUpdate: VSCode.Event<VSCode.Uri> = extensionApi.onDidClasspathUpdate;
        classpathChangeListener = onDidClasspathUpdate(function (uri) {
          languageClient.onReady().then(() => languageClient.didClasspathUpdate(uri));
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

function newServerModeChangeListener(languageClient: SonarLintExtendedLanguageClient) {
  return (serverMode: ServerMode) => {
    if (serverMode !== ServerMode.LIGHTWEIGHT) {
      // Reset state of LightWeight mode warning
      javaServerInLightWeightModeAlreadyLogged = false;
    }
    languageClient.onReady().then(() => languageClient.didJavaServerModeChange(serverMode));
  };
}

export function installServerModeChangeListener(languageClient: SonarLintExtendedLanguageClient) {
  const extension = getJavaExtension();
  if (extension?.isActive) {
    if (!serverModeListener) {
      const extensionApi = extension.exports;
      if (extensionApi && isJavaApiRecentEnough(extensionApi.apiVersion) && extensionApi.onDidServerModeChange) {
        const onDidServerModeChange: VSCode.Event<ServerMode> = extensionApi.onDidServerModeChange;
        serverModeListener = onDidServerModeChange(newServerModeChangeListener(languageClient));
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
  const extension = getJavaExtension();
  try {
    const extensionApi = await extension?.activate();
    if (extensionApi && isJavaApiRecentEnough(extensionApi.apiVersion)) {
      installClasspathListener(languageClient);
      installServerModeChangeListener(languageClient);
      if (extensionApi.serverMode === ServerMode.LIGHTWEIGHT) {
        return javaConfigDisabledInLightWeightMode();
      }
      const isTest: boolean = await extensionApi.isTestFile(fileUri);
      const COMPILER_COMPLIANCE_SETTING_KEY = 'org.eclipse.jdt.core.compiler.compliance';
      const VM_LOCATION_SETTING_KEY = 'org.eclipse.jdt.ls.core.vm.location';
      const projectSettings: { [name: string]: string } = await extensionApi.getProjectSettings(fileUri, [
        COMPILER_COMPLIANCE_SETTING_KEY,
        VM_LOCATION_SETTING_KEY
      ]);
      const sourceLevel = projectSettings[COMPILER_COMPLIANCE_SETTING_KEY];
      const vmLocation = projectSettings[VM_LOCATION_SETTING_KEY];
      const classpathResult = await extensionApi.getClasspaths(fileUri, { scope: isTest ? 'test' : 'runtime' });

      return {
        projectRoot: classpathResult.projectRoot,
        sourceLevel,
        classpath: classpathResult.classpaths,
        isTest,
        vmLocation
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
