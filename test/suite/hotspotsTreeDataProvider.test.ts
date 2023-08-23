import {
  ConnectionSettingsService,
  SonarCloudConnection,
  SonarQubeConnection
} from '../../src/settings/connectionsettings';
import { AllHotspotsTreeDataProvider, HotspotNode } from '../../src/hotspot/hotspotsTreeDataProvider';
import { assert } from 'chai';
import * as vscode from 'vscode';
import { TextDocument, ThemeIcon } from 'vscode';
import { protocol2CodeConverter } from '../../src/util/uri';
import { DEFAULT_CONNECTION_ID } from '../../src/commons';

const mockSettingsServiceWithConnections = {
  getSonarQubeConnections(): SonarQubeConnection[] {
    return [{ serverUrl: 'https://next.sonarqube.com/sonarqube', connectionId: 'connectionId' }];
  },
  getSonarCloudConnections(): SonarCloudConnection[] {
    return [{ organizationKey: 'myOrg', connectionId: DEFAULT_CONNECTION_ID }];
  },
  async loadSonarCloudConnection(connectionId: string): Promise<SonarCloudConnection> {
    return { organizationKey: 'orgKey', connectionId: connectionId };
  }
} as ConnectionSettingsService;

const mockSettingsServiceWithOneConnection = {
  getSonarQubeConnections(): SonarQubeConnection[] {
    return [{ serverUrl: 'https://next.sonarqube.com/sonarqube', connectionId: 'connectionId' }];
  },
  getSonarCloudConnections(): SonarCloudConnection[] {
    return [];
  }
} as ConnectionSettingsService;

const mockSettingsServiceWithOutConnections = {
  getSonarQubeConnections(): SonarQubeConnection[] {
    return [];
  },
  getSonarCloudConnections(): SonarCloudConnection[] {
    return [];
  }
} as ConnectionSettingsService;

let underTestWithDummyInitData: AllHotspotsTreeDataProvider;

let underTestWithValidInitData: AllHotspotsTreeDataProvider;
let fullFile1Uri;
let fullFile2Uri;
let diagnostic6;
let openDocuments: TextDocument[];

suite('Hotspots tree view test suite', () => {
  setup(() => {
    underTestWithDummyInitData = new AllHotspotsTreeDataProvider(mockSettingsServiceWithOneConnection);
    const diagnostic1 = {
      flows: [],
      range: { start: { line: 1, character: 1 }, end: { line: 2, character: 1 } },
      message: 'hotspot 1',
      source: 'sonarlint'
    };
    const diagnostic2 = {
      flows: [],
      range: { start: { line: 2, character: 1 }, end: { line: 4, character: 1 } },
      message: 'hotspot 2',
      source: 'remote'
    };
    const diagnostic3 = {
      flows: [],
      range: { start: { line: 3, character: 1 }, end: { line: 5, character: 1 } },
      message: 'hotspot 3',
      source: 'remote'
    };
    const diagnostic4 = {
      flows: [],
      range: { start: { line: 3, character: 1 }, end: { line: 5, character: 1 } },
      message: 'hotspot 4',
      source: 'openInIde'
    };

    underTestWithDummyInitData.fileHotspotsCache.set('file1', [diagnostic1, diagnostic3]);
    underTestWithDummyInitData.fileHotspotsCache.set('file2', [diagnostic2]);
    underTestWithDummyInitData.fileHotspotsCache.set('file3', [diagnostic4]);

    underTestWithValidInitData = new AllHotspotsTreeDataProvider(mockSettingsServiceWithOneConnection);
    const diagnostic5 = {
      flows: [],
      range: { start: { line: 1, character: 1 }, end: { line: 2, character: 1 } },
      message: 'hotspot 1',
      source: 'sonarlint',
      data: {
        entryKey: 'hotspotKey2'
      }
    };
    diagnostic6 = {
      flows: [],
      range: { start: { line: 2, character: 1 }, end: { line: 4, character: 1 } },
      message: 'hotspot 2',
      source: 'remote',
      data: {
        entryKey: 'hotspotKey2'
      }
    };

    fullFile1Uri = `${vscode.workspace.workspaceFolders[0].uri}/sample-js/main.js`;
    fullFile2Uri = `${vscode.workspace.workspaceFolders[0].uri}/sample-multi-js/folder1/sample.js`;

    underTestWithValidInitData.fileHotspotsCache.set(fullFile1Uri, [diagnostic5]);
    underTestWithValidInitData.fileHotspotsCache.set(fullFile2Uri, [diagnostic6]);

    openDocuments = [createOpenTextDocument(fullFile1Uri), createOpenTextDocument(fullFile2Uri)];
  });

  suite('countAllHotspots()', () => {
    test('countAllHotspots should count all hotspots in open files', () => {
      underTestWithValidInitData.showHotspotsInOpenFiles();
      assert.equal(underTestWithValidInitData.countAllHotspots(openDocuments), 2);
    });
    test('countAllHotspots should return 0 when there are no hotspots', () => {
      const underTest = new AllHotspotsTreeDataProvider(mockSettingsServiceWithConnections);

      assert.equal(underTest.countAllHotspots(), 0);
    });
  });

  suite('isAnyConnectionConfigured()', () => {
    test('Should return true when two connections exist', () => {
      const underTest = new AllHotspotsTreeDataProvider(mockSettingsServiceWithConnections);
      assert.isTrue(underTest.isAnyConnectionConfigured());
    });
    test('Should return true when one connection exists', () => {
      const underTest = new AllHotspotsTreeDataProvider(mockSettingsServiceWithOneConnection);
      assert.isTrue(underTest.isAnyConnectionConfigured());
    });
    test('Should return false when no connection exists', () => {
      const underTest = new AllHotspotsTreeDataProvider(mockSettingsServiceWithOutConnections);
      assert.isFalse(underTest.isAnyConnectionConfigured());
    });
  });

  suite('getHotspotItemContextValue()', () => {
    test('Should return remoteHotspotItem when source is openInIde', () => {
      const itemContextValue = underTestWithDummyInitData.getHotspotItemContextValue(
        { source: 'openInIde' },
        'knownHotspotsGroup'
      );
      assert.equal(itemContextValue, 'remoteHotspotItem');
    });
    test('Should return knownHotspotItem', () => {
      const itemContextValue = underTestWithDummyInitData.getHotspotItemContextValue(
        { source: 'sonarqube' },
        'knownHotspotsGroup'
      );
      assert.equal(itemContextValue, 'knownHotspotItem');
    });
    test('Should return newHotspotItem', () => {
      const itemContextValue = underTestWithDummyInitData.getHotspotItemContextValue(
        { source: 'sonarlint' },
        'newHotspotsGroup'
      );
      assert.equal(itemContextValue, 'newHotspotItem');
    });
  });

  suite('fileHasNewHotspots() & fileHasTrackedHotspots() & openHotspotInIdeForFileWasTriggered()', () => {
    test('should return true when one diag source is sonarlint', () => {
      assert.equal(underTestWithDummyInitData.fileHasNewHotspots('file1'), true);
      assert.equal(underTestWithDummyInitData.fileHasNewHotspots('file2'), false);

      assert.equal(underTestWithDummyInitData.fileHasTrackedHotspots('file1'), true);
      assert.equal(underTestWithDummyInitData.fileHasTrackedHotspots('file2'), true);

      assert.equal(underTestWithDummyInitData.openHotspotInIdeForFileWasTriggered('file3'), true);
      assert.equal(underTestWithDummyInitData.openHotspotInIdeForFileWasTriggered('file2'), false);
    });
  });

  suite('getHotspotsGroupsForFile()', () => {
    test('should return correct groups for file1', () => {
      const file1Groups = underTestWithDummyInitData.getHotspotsGroupsForFile('file1');
      assert.equal(file1Groups.length, 2);
      assert.isTrue(file1Groups.some(g => g.contextValue === 'knownHotspotsGroup'));
      assert.isTrue(file1Groups.some(g => g.contextValue === 'newHotspotsGroup'));
    });

    test('should return correct groups for file2', () => {
      const file2Groups = underTestWithDummyInitData.getHotspotsGroupsForFile('file2');
      assert.equal(file2Groups.length, 1);
      assert.equal(file2Groups[0].contextValue, 'knownHotspotsGroup');
    });

    test('should return correct groups for file3', () => {
      const file3Groups = underTestWithDummyInitData.getHotspotsGroupsForFile('file3');
      assert.equal(file3Groups.length, 1);
      assert.equal(file3Groups[0].contextValue, 'knownHotspotsGroup');
    });
  });

  suite('hasLocalHotspots()', () => {
    test('returns true for initial data', () => {
      assert.isTrue(underTestWithDummyInitData.hasLocalHotspots());
    });
    test('returns false if there is only openInIde hotspot', () => {
      const underTest = new AllHotspotsTreeDataProvider(mockSettingsServiceWithOneConnection);
      const diagnostic = {
        flows: [],
        range: { start: { line: 3, character: 1 }, end: { line: 5, character: 1 } },
        message: 'hotspot 4',
        source: 'openInIde'
      };

      underTestWithDummyInitData.fileHotspotsCache.set('file1', [diagnostic]);

      assert.isFalse(underTest.hasLocalHotspots());
    });
    test('returns false if there is only openInIde hotspot', () => {
      const underTest = new AllHotspotsTreeDataProvider(mockSettingsServiceWithOneConnection);
      const diagnostic = {
        flows: [],
        range: { start: { line: 3, character: 1 }, end: { line: 5, character: 1 } },
        message: 'hotspot 4',
        source: 'openInIde'
      };

      underTest.fileHotspotsCache.set('file1', [diagnostic]);

      assert.isFalse(underTest.hasLocalHotspots());
    });

    test('returns true if there are only known hotspots', () => {
      const underTest = new AllHotspotsTreeDataProvider(mockSettingsServiceWithOneConnection);
      const diagnostic1 = {
        flows: [],
        range: { start: { line: 3, character: 1 }, end: { line: 5, character: 1 } },
        message: 'hotspot 1',
        source: 'remote'
      };
      const diagnostic2 = {
        flows: [],
        range: { start: { line: 4, character: 1 }, end: { line: 5, character: 1 } },
        message: 'hotspot 4',
        source: 'remote'
      };

      underTest.fileHotspotsCache.set('file1', [diagnostic1, diagnostic2]);

      assert.isTrue(underTest.hasLocalHotspots());
    });
  });

  suite('getHotspotsForFile()', () => {
    test('get one known hotspot', () => {
      underTestWithValidInitData.getChildren(null);

      const hotspotsForFile1 = underTestWithValidInitData.getHotspotsForFile(fullFile1Uri, 'newHotspotsGroup');
      const hotspotsForFile2 = underTestWithValidInitData.getHotspotsForFile(fullFile2Uri, 'knownHotspotsGroup');

      assert.equal(hotspotsForFile1.length, 1);
      assert.equal(hotspotsForFile1[0].contextValue, 'newHotspotItem');

      assert.equal(hotspotsForFile2.length, 1);
      assert.equal(hotspotsForFile2[0].contextValue, 'knownHotspotItem');
      assert.equal(hotspotsForFile2[0].label, diagnostic6.message);
    });
  });

  suite('getFiles()', () => {
    test('should return empty list when there is no connection', () => {
      const underTest = new AllHotspotsTreeDataProvider(mockSettingsServiceWithOutConnections);
      const children = underTest.getChildren(null);

      assert.equal(children.length, 0);
    });

    test('should return list with file groups when cache is not empty', () => {
      const children = underTestWithValidInitData.getFiles(openDocuments);

      assert.equal(children.length, 2);
      assert.equal(children[0].contextValue, 'hotspotsFileGroup');
    });

    test('should return hotspot groups for files', () => {
      let fileGroups = underTestWithValidInitData.getFiles(openDocuments);
      const hotspotGroups = underTestWithValidInitData.getChildren(fileGroups[0]);

      assert.equal(hotspotGroups.length, 1);
      assert.equal((hotspotGroups[0].iconPath as ThemeIcon).id, 'security-hotspot');
    });

    test('should return a hotspot', () => {
      const fileGroups = underTestWithValidInitData.getFiles(openDocuments);
      const hotspotGroups = underTestWithValidInitData.getChildren(fileGroups[0]);
      const hotspots = underTestWithValidInitData.getChildren(hotspotGroups[0]);

      assert.equal(hotspots.length, 1);
      assert.isTrue((hotspots[0].label as string).includes('hotspot'));
      assert.equal((hotspots[0] as HotspotNode).key, 'hotspotKey2');
    });
  });
  function createOpenTextDocument(uri: string): vscode.TextDocument {
    const uriPath = protocol2CodeConverter(uri).path;
    return {
      // @ts-ignore
      uri: {
        path: uriPath
      },
      version: 11,
      getText(): string {
        return 'text in editor';
      },
      languageId: 'languageFromEditor',
      fileName: 'sample.js'
    };
  }
});
