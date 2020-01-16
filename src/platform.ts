/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All Rights Reserved.
 * See 'LICENSE' in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as os from 'os';
import * as util from './util';
import { LinuxDistribution } from './linuxDistribution';

function platformToJreOs(platform: string) {
    return {
        'win32': 'windows',
        'linux': 'linux',
        'darwin': 'mac'
    }[platform];
}

function archToJreArch(arch: string) {
    return {
        'x86_64': 'x64',
        'x86': 'x32'
    }[arch];
}

export class PlatformInformation {
    constructor(public os: string, public arch: string) { }

    public static GetPlatformInformation(): Promise<PlatformInformation> {
        const platform: string = os.platform();
        let architecturePromise: Promise<string>;

        switch (platform) {
            case 'win32':
                architecturePromise = PlatformInformation.GetWindowsArchitecture();
                break;

            case 'linux':
            case 'darwin':
                architecturePromise = PlatformInformation.GetUnixArchitecture();
                break;
        }

        return architecturePromise.then(arch => {
            return new PlatformInformation(platformToJreOs(platform), archToJreArch(arch));
        });
    }

    public static GetUnknownArchitecture(): string { return 'Unknown'; }

    private static async GetWindowsArchitecture(): Promise<string> {
        return util.execChildProcess('wmic os get osarchitecture', util.extensionPath)
            .then((architecture) => {
                if (architecture) {
                    const archArray: string[] = architecture.split(os.EOL);
                    if (archArray.length >= 2) {
                        const arch = archArray[1].trim();

                        // Note: This string can be localized. So, we'll just check to see if it contains 32 or 64.
                        if (arch.indexOf('64') >= 0) {
                            return 'x86_64';
                        } else if (arch.indexOf('32') >= 0) {
                            return 'x86';
                        }
                    }
                }
                return PlatformInformation.GetUnknownArchitecture();
            }).catch((error) => {
                return PlatformInformation.GetUnknownArchitecture();
            });
    }

    private static async GetUnixArchitecture(): Promise<string> {
        return util.execChildProcess('uname -m', util.packageJson.extensionFolderPath)
            .then((architecture) => {
                if (architecture) {
                    return architecture.trim();
                }
                return null;
            });
    }
}