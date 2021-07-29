/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License.
 *  See https://github.com/microsoft/vscode/blob/6f9483bab6b95396cf58ff188b48d22ae18f7da6/LICENSE.txt
 *  for license information.
 *--------------------------------------------------------------------------------------------*/

export interface Git {
    readonly path: string;
}

export interface API {
    readonly git: Git;
}

export interface GitExtension {

    /**
     * Returns a specific API version.
     *
     * Throws error if git extension is disabled. You can listed to the
     * [GitExtension.onDidChangeEnablement](#GitExtension.onDidChangeEnablement) event
     * to know when the extension becomes enabled/disabled.
     *
     * @param version Version number.
     * @returns API instance
     */
    getAPI(version: 1): API;
}
