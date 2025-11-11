/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { executeWithDurationLog, deployAllMicrosoft } from './common.mjs';
import { deployAllOpenVSX } from './deployAllOpenVSX.mjs';
import { deployBuildInfo, collectArtifactInfo } from './deployUtils.mjs';

// Deploy Microsoft marketplace variants (with OmniSharp in all packages)
await executeWithDurationLog(async () => {
  await deployAllMicrosoft();
}, 'Deploy-all-microsoft');

// Collect Microsoft artifact information (universal + platform-specific VSIXs)
const microsoftArtifacts = collectArtifactInfo();

// Deploy OpenVSX variants (without OmniSharp in platform-specific packages)
// This overwrites the platform-specific VSIXs, but we've already captured Microsoft metadata
await executeWithDurationLog(async () => {
  await deployAllOpenVSX();
}, 'Deploy-all-openvsx');

// Collect OpenVSX artifact information (only -openvsx- prefixed files)
const openvsxArtifacts = collectArtifactInfo('*-openvsx-*');

// Deploy build info with ALL artifacts from both Microsoft and OpenVSX deployments
await executeWithDurationLog(async () => {
  await deployBuildInfo(microsoftArtifacts, openvsxArtifacts);
}, 'Deploy-build-info');
