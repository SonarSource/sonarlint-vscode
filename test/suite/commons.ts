import { sleep } from '../testutil';
import * as VSCode from 'vscode';

export const sampleFolderLocation = '../../../test/samples/';

export const SETUP_TEARDOWN_HOOK_TIMEOUT = 10_000;

export async function selectFirstQuickPickItem() {
  // Wait for the input field to show
  await sleep(1000);
  await VSCode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
  // Wait for the settings to be updated
  await sleep(2000);
}
