/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

const vscode = acquireVsCodeApi();

window.addEventListener('load', init);
window.addEventListener('message', handleMessage);

function byIdStarting(elementIdStarting) {
  return document.querySelectorAll(`[id^="${elementIdStarting}"]`);
}

function init() {
  byIdStarting('contextSwitchButton').forEach(element => element.addEventListener('click', onClickContextSwitchButton));
}

function onClickContextSwitchButton() {
  console.log('Heloooooo');
}
