/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as VSCode from 'vscode';
import { ExtendedServer } from '../lsp/protocol';
import { projectToQuickPickItem } from '../util/bindingUtils';
import { ServerType } from './connections';

const PROJECT_SEARCH_DEBOUNCE_MS = 300;

interface RemoteProjectQuickPickOptions {
  selectedFolderName: string;
  serverType: ServerType;
  initialItems: readonly VSCode.QuickPickItem[];
  searchProjects: (searchText: string) => Thenable<ExtendedServer.FuzzySearchProjectsResponse>;
  onAccept: (projectKey: string) => void;
  onOpenInBrowser: (projectKey: string) => void;
}

export function showRemoteProjectQuickPick(options: RemoteProjectQuickPickOptions): void {
  const picker = VSCode.window.createQuickPick();
  picker.title = `Select ${options.serverType} Project to Bind with '${options.selectedFolderName}/'`;
  picker.placeholder = `Select the remote project you want to bind with '${options.selectedFolderName}/' folder`;
  picker.items = options.initialItems;
  picker.ignoreFocusOut = true;

  let timer: ReturnType<typeof setTimeout>;
  let generation = 0;
  let closed = false;

  function dispose() {
    if (closed) {
      return;
    }
    closed = true;
    clearTimeout(timer);
    subscriptions.forEach(subscription => subscription.dispose());
    picker.dispose();
  }

  async function searchProjects(searchText: string, requestGeneration: number) {
    const isCurrent = () => !closed && generation === requestGeneration;
    try {
      const response = await options.searchProjects(searchText);
      if (isCurrent()) {
        picker.items = response.topResults.map(project => ({ ...projectToQuickPickItem(project, options.serverType), alwaysShow: true }));
        picker.activeItems = picker.items.slice(0, 1);
      }
    } catch {
      if (isCurrent()) {
        picker.items = [];
        picker.activeItems = [];
        void VSCode.window.showErrorMessage('Request Failed: Could not search remote projects. Please check the connection.');
      }
    } finally {
      if (isCurrent()) {
        picker.busy = false;
      }
    }
  }

  function scheduleSearch(value: string) {
    if (closed) {
      return;
    }
    generation++;
    const requestGeneration = generation;
    clearTimeout(timer);
    const searchText = value.trim();
    if (!searchText) {
      picker.items = options.initialItems;
    }
    picker.activeItems = [];
    picker.busy = !!searchText;
    if (searchText) {
      timer = setTimeout(() => void searchProjects(searchText, requestGeneration), PROJECT_SEARCH_DEBOUNCE_MS);
    }
  }

  function acceptSelectedProject() {
    const selectedProject = picker.selectedItems[0];
    if (closed || picker.busy || !picker.items.includes(selectedProject)
      || selectedProject.kind === VSCode.QuickPickItemKind.Separator) {
      return;
    }
    dispose();
    options.onAccept(selectedProject.description);
  }

  const subscriptions = [
    picker.onDidChangeValue(scheduleSearch),
    picker.onDidTriggerItemButton(event => options.onOpenInBrowser(event.item.description)),
    picker.onDidAccept(acceptSelectedProject),
    picker.onDidHide(dispose)
  ];
  picker.show();
}
