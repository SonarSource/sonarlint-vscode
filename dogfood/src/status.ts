/* --------------------------------------------------------------------------------------------
 * SonarLint Dogfood
 * Copyright (C) 2021-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
export class Status {

  private constructor(readonly text: string, readonly tooltip: string) {
    // Empty
  }

  static readonly UNKNOWN = new Status('😺', 'Unknown');
  static readonly IDLE = new Status('😸', 'Idle');
  static readonly DISABLED = new Status('😿', 'Disabled');
  static readonly UPDATE_AVAILABLE = new Status('😻', 'Update Available');
  static readonly CHECKING = new Status('😼', 'Checking');
  static readonly DOWNLOADING = new Status('😼', 'Downloading');
  static readonly UNINSTALLING = new Status('😼', 'Uninstalling Previous Build');
  static readonly INSTALLING = new Status('😼', 'Installing Next Build');
  static readonly ERROR = new Status('🙀', 'Error (check console)');
  static readonly UNAUTHENTICATED = new Status('🙀 + 🔌', 'Error: Please Provide Artifactory User Token');
  static readonly PINNED_VERSION_USED = new Status('😸 + 📌', 'Installed dogfooding version that was specified in user settings.')
}