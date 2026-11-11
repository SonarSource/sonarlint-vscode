/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as VSCode from 'vscode';
import { DEFAULT_CONNECTION_ID } from '../../src/commons';
import { BindingService } from '../../src/connected/binding';
import { ServerType } from '../../src/connected/connections';
import { SonarLintExtendedLanguageClient } from '../../src/lsp/client';
import { ExtendedServer } from '../../src/lsp/protocol';
import { Commands } from '../../src/util/commands';

function deferred() {
  let resolve: (value: ExtendedServer.FuzzySearchProjectsResponse) => void;
  let reject: (reason: Error) => void;
  const promise = new Promise<ExtendedServer.FuzzySearchProjectsResponse>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const results = { topResults: [{ key: 'needle', name: 'Zebra' }, { key: 'other', name: 'Alpha' }] };

suite('Dynamic project search', () => {
  let sandbox: sinon.SinonSandbox;
  let clock: sinon.SinonFakeTimers;
  let service: BindingService;
  let picker;
  let client;
  let save: sinon.SinonStub;
  let error: sinon.SinonStub;
  let command: sinon.SinonStub;
  let value: VSCode.EventEmitter<string>;
  let accept: VSCode.EventEmitter<void>;
  let hide: VSCode.EventEmitter<void>;
  let button: VSCode.EventEmitter<VSCode.QuickPickItemButtonEvent<VSCode.QuickPickItem>>;
  let selection: VSCode.EventEmitter<readonly VSCode.QuickPickItem[]>;
  let subscriptions: sinon.SinonSpy[];
  const folder = { uri: VSCode.Uri.file('/tmp/project-search'), name: 'local', index: 0 };

  setup(async () => {
    sandbox = sinon.createSandbox();
    clock = sandbox.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    value = new VSCode.EventEmitter();
    accept = new VSCode.EventEmitter();
    hide = new VSCode.EventEmitter();
    button = new VSCode.EventEmitter();
    selection = new VSCode.EventEmitter();
    subscriptions = [];
    const listen = <T>(emitter: VSCode.EventEmitter<T>) => (handler: (event: T) => void) => {
      const disposable = emitter.event(handler);
      subscriptions.push(sandbox.spy(disposable, 'dispose'));
      return disposable;
    };
    picker = {
      items: [], selectedItems: [], activeItems: [], busy: false,
      show: sandbox.spy(), dispose: sandbox.spy(() => hide.fire()),
      onDidChangeValue: listen(value), onDidAccept: listen(accept), onDidHide: listen(hide),
      onDidTriggerItemButton: listen(button), onDidChangeSelection: listen(selection)
    };
    sandbox.stub(VSCode.window, 'createQuickPick').returns(picker);
    error = sandbox.stub(VSCode.window, 'showErrorMessage').resolves(undefined);
    command = sandbox.stub(VSCode.commands, 'executeCommand').resolves(undefined);
    client = {
      getSuggestedBinding: sandbox.stub().resolves({ suggestions: {
        [folder.uri.toString()]: [{ sonarProjectKey: 'suggested', sonarProjectName: 'Suggested' }]
      } }),
      getRemoteProjectsForConnection: sandbox.stub().resolves({ zeta: 'Zeta', alpha: 'Alpha', suggested: 'Suggested' }),
      fuzzySearchProjects: sandbox.stub().resolves(results)
    };
    service = new BindingService(client, undefined, undefined, undefined);
    sandbox.stub(service, 'getBaseServerUrl').resolves('https://server/dashboard');
    save = sandbox.stub(service, 'saveManualBinding').resolves();
  });

  teardown(() => {
    hide.fire();
    [value, accept, hide, button, selection].forEach(emitter => emitter.dispose());
    sandbox.restore();
  });

  async function open(connectionId = 'connection') {
    await service['pickRemoteProjectToBind'](connectionId, folder, ServerType.SonarQube, folder.name);
  }

  async function search(text: string) {
    value.fire(text);
    await clock.tickAsync(300);
  }

  test('client sends the configured request and exact parameters', async () => {
    const sendRequest = sandbox.stub().resolves(results);
    const response = await SonarLintExtendedLanguageClient.prototype.fuzzySearchProjects.call({ sendRequest } as any, 'connection', 'needle');
    expect(sendRequest.calledOnceWithExactly(ExtendedServer.FuzzySearchProjects.type, { connectionId: 'connection', searchText: 'needle' })).to.be.true;
    expect(response).to.equal(results);
  });

  test('preserves grouped, deduplicated, alphabetized initial items without binding on selection', async () => {
    await open();
    expect(picker.items.map(item => item.label)).to.deep.equal(['Suggested Projects', 'Suggested', 'All Projects', 'Alpha', 'Zeta']);
    expect(picker.items[1].description).to.equal('suggested');
    expect(picker.items[1].buttons[0].tooltip).to.equal('View in SonarQube Server');
    picker.selectedItems = [picker.items[1]];
    selection.fire(picker.selectedItems);
    expect(save.called).to.be.false;
    expect(client.fuzzySearchProjects.called).to.be.false;
  });

  test('trims and debounces single characters, normalizes default ID, and activates Core first result', async () => {
    await open('');
    value.fire('old');
    await clock.tickAsync(200);
    value.fire(' n ');
    expect(picker.items).to.deep.equal([]);
    expect(picker.busy).to.be.true;
    await clock.tickAsync(299);
    expect(client.fuzzySearchProjects.called).to.be.false;
    await clock.tickAsync(1);
    expect(client.fuzzySearchProjects.calledOnceWithExactly(DEFAULT_CONNECTION_ID, 'n')).to.be.true;
    expect(picker.items.map(item => item.description)).to.deep.equal(['needle', 'other']);
    expect(picker.items.every(item => item.alwaysShow)).to.be.true;
    expect(picker.activeItems).to.deep.equal([picker.items[0]]);
    expect(picker.busy).to.be.false;
  });

  test('blank restores the original snapshot immediately and invalidates pending work', async () => {
    const pending = deferred();
    client.fuzzySearchProjects.returns(pending.promise);
    await open();
    const initialItems = picker.items;
    await search('needle');
    value.fire('  ');
    expect(picker.items).to.equal(initialItems);
    expect(picker.busy).to.be.false;
    pending.resolve(results);
    await clock.tickAsync(300);
    expect(picker.items).to.equal(initialItems);
    expect(client.fuzzySearchProjects.calledOnce).to.be.true;
    value.fire('cancelled');
    value.fire('');
    await clock.tickAsync(300);
    expect(client.fuzzySearchProjects.calledOnce).to.be.true;
  });

  test('stale success and its finalizer cannot replace items or clear current busy state', async () => {
    const old = deferred();
    const current = deferred();
    client.fuzzySearchProjects.onFirstCall().returns(old.promise).onSecondCall().returns(current.promise);
    await open();
    await search('old');
    await search('current');
    old.resolve(results);
    await clock.tickAsync(0);
    expect(picker.items).to.deep.equal([]);
    expect(picker.busy).to.be.true;
    current.resolve({ topResults: [{ key: 'current', name: 'Current' }] });
    await clock.tickAsync(0);
    expect(picker.items[0].description).to.equal('current');
    expect(picker.busy).to.be.false;
  });

  test('stale failure cannot report an error or change a newer completed search', async () => {
    const old = deferred();
    client.fuzzySearchProjects.onFirstCall().returns(old.promise);
    await open();
    await search('old');
    await search('current');
    const currentItems = picker.items;
    old.reject(new Error('stale'));
    await clock.tickAsync(0);
    expect(picker.items).to.equal(currentItems);
    expect(picker.busy).to.be.false;
    expect(error.called).to.be.false;
  });

  test('guards busy, empty, separator, and stale selections and accepts a current project once', async () => {
    const pending = deferred();
    client.fuzzySearchProjects.returns(pending.promise);
    await open();
    picker.selectedItems = [picker.items[0]];
    accept.fire();
    picker.selectedItems = [picker.items[1]];
    await search('needle');
    accept.fire();
    expect(save.called).to.be.false;
    pending.resolve(results);
    await clock.tickAsync(0);
    accept.fire();
    picker.selectedItems = [];
    accept.fire();
    expect(save.called).to.be.false;
    picker.selectedItems = [picker.items[0]];
    accept.fire();
    accept.fire();
    hide.fire();
    expect(save.calledOnceWithExactly('needle', folder, 'connection')).to.be.true;
    expect(picker.dispose.calledOnce).to.be.true;
    expect(subscriptions.every(dispose => dispose.calledOnce)).to.be.true;
  });

  test('current failure keeps the picker open for empty results and a successful retry', async () => {
    client.fuzzySearchProjects.onFirstCall().rejects(new Error('offline')).onSecondCall().resolves({ topResults: [] });
    await open();
    await search('failed');
    expect(picker.items).to.deep.equal([]);
    expect(picker.busy).to.be.false;
    expect(error.calledOnce).to.be.true;
    expect(picker.dispose.called).to.be.false;
    await search('empty');
    accept.fire();
    expect(picker.items).to.deep.equal([]);
    expect(save.called).to.be.false;
    await search('recovered');
    expect(picker.items[0].description).to.equal('needle');
    expect(picker.busy).to.be.false;
  });

  test('browser buttons do not bind or take ownership of busy state', async () => {
    await open();
    button.fire({ item: picker.items[1], button: picker.items[1].buttons[0] });
    expect(command.calledOnceWithExactly(Commands.OPEN_BROWSER, VSCode.Uri.parse('https://server/dashboard?id=suggested'))).to.be.true;
    expect(picker.busy).to.be.false;
    const pending = deferred();
    client.fuzzySearchProjects.returns(pending.promise);
    const item = picker.items[1];
    await search('pending');
    button.fire({ item, button: item.buttons[0] });
    expect(picker.busy).to.be.true;
    expect(save.called).to.be.false;
  });

  for (const reject of [false, true]) {
    test(`dismissal ignores late ${reject ? 'failure' : 'success'} and disposes once`, async () => {
      const pending = deferred();
      client.fuzzySearchProjects.returns(pending.promise);
      await open();
      await search('pending');
      hide.fire();
      const items = picker.items;
      reject ? pending.reject(new Error('late')) : pending.resolve(results);
      await clock.tickAsync(0);
      expect(picker.items).to.equal(items);
      expect(error.called).to.be.false;
      expect(save.called).to.be.false;
      expect(picker.dispose.calledOnce).to.be.true;
      expect(subscriptions.every(dispose => dispose.calledOnce)).to.be.true;
    });
  }

  test('dismissal cancels debounce without making a request', async () => {
    await open();
    value.fire('cancelled');
    hide.fire();
    await clock.tickAsync(300);
    expect(client.fuzzySearchProjects.called).to.be.false;
    expect(save.called).to.be.false;
  });
});
