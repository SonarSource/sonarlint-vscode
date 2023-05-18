/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

// Heavily inspired by https://github.com/microsoft/vscode-extension-samples/tree/main/quickinput-sample
// Copyright (c) Microsoft Corporation.

import { Disposable, QuickInput, QuickPickItem, window } from 'vscode';

export class MultiStepInput {

  static async run(start: InputStep) {
    const input = new MultiStepInput();
    return input.stepThrough(start);
  }

  private current?: QuickInput;

  private async stepThrough(start: InputStep) {
    let step: InputStep | void = start;
    while (step) {
      if (this.current) {
        this.current.enabled = false;
        this.current.busy = true;
      }
      step = await step(this);
    }
    if (this.current) {
      this.current.dispose();
    }
  }

  async showQuickPick(params: QuickPickParameters): Promise<QuickPickItem> {
    const disposables: Disposable[] = [];
    const { title, step, totalSteps, items, placeholder } = params;
    try {
      return await new Promise<QuickPickItem>((resolve) => {
        const input = window.createQuickPick<QuickPickItem>();
        input.title = title;
        input.step = step;
        input.totalSteps = totalSteps;
        input.ignoreFocusOut = false;
        input.placeholder = placeholder;
        input.items = items;
        disposables.push(
          input.onDidChangeSelection(items => resolve(items[0])),
        );
        if (this.current) {
          this.current.dispose();
        }
        this.current = input;
        this.current.show();
      });
    } finally {
      disposables.forEach(d => d.dispose());
    }
  }

  async showInputBox(params: InputBoxParameters): Promise<string> {
    const disposables: Disposable[] = [];
    const { title, step, totalSteps, value, prompt, placeholder } = params;
    try {
      return await new Promise<string>((resolve) => {
        const input = window.createInputBox();
        input.title = title;
        input.step = step;
        input.totalSteps = totalSteps;
        input.value = value || '';
        input.prompt = prompt;
        input.ignoreFocusOut = false;
        input.placeholder = placeholder;
        input.buttons = [];
        disposables.push(
          input.onDidAccept(async () => {
            resolve(input.value);
          }),
        );
        if (this.current) {
          this.current.dispose();
        }
        this.current = input;
        this.current.show();
      });
    } finally {
      disposables.forEach(d => d.dispose());
    }
  }
}

type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

interface QuickPickParameters {
  title: string;
  step: number;
  totalSteps: number;
  items: QuickPickItem[];
  placeholder: string;
}

interface InputBoxParameters {
  title: string;
  step: number;
  totalSteps: number;
  value: string;
  prompt: string;
  placeholder?: string;
}
