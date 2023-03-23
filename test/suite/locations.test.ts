/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as path from 'path';
import * as vscode from 'vscode';
import { expect } from 'chai';

import { FileItem, FlowItem, IssueItem, LocationItem, SecondaryLocationsTree } from '../../src/location/locations';
import { sampleFolderLocation } from './commons';

function uriStringFor(...fragments: string[]) {
  return vscode.Uri.file(path.join(__dirname, sampleFolderLocation, ...fragments)).toString();
}

suite('locations', () => {
  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('should initialize with empty tree', () => {
    const underTest = new SecondaryLocationsTree();

    const children = underTest.getChildren(null);
    expect(children).to.have.lengthOf(1);
    expect(children[0]).to.be.null;
  });

  test('should show basic local issue with one additional location', async () => {
    const underTest = new SecondaryLocationsTree();

    const fileUri = uriStringFor('sample-js', 'main.js');
    const issue = {
      fileUri,
      message: 'Somewhere, over the rainbow',
      severity: 'INFO',
      ruleKey: 'some:where',
      flows: [
        {
          locations: [
            {
              message: 'Way up high',
              uri: fileUri,
              filePath: 'sample-js/main.js',
              textRange: {
                startLine: 1,
                startLineOffset: 0,
                endLine: 1,
                endLineOffset: 9
              },
              exists: true,
              codeMatches: true
            }
          ]
        }
      ],
      textRange: {
        startLine: 1,
        startLineOffset: 0,
        endLine: 1,
        endLineOffset: 9
      }
    };

    await underTest.showAllLocations(issue);

    const rootChildren = underTest.getChildren(null);
    expect(rootChildren).to.have.lengthOf(1);

    const rootNode = rootChildren[0] as IssueItem;
    expect(rootNode.label).to.equal('Somewhere, over the rainbow');

    const issueChildren = underTest.getChildren(rootNode);
    expect(issueChildren).to.have.lengthOf(1);

    const locationItem = issueChildren[0] as LocationItem;
    expect(locationItem.label).to.equal('1: Way up high');

    const locationChildren = underTest.getChildren(locationItem);
    expect(locationChildren).to.be.empty;

    underTest.hideLocations();

    const clearedChildren = underTest.getChildren(null);
    expect(clearedChildren).to.have.lengthOf(1);
    expect(clearedChildren[0]).to.be.null;
  });

  test('should show basic local issue with 2 flows', async () => {
    const underTest = new SecondaryLocationsTree();

    const fileUri = uriStringFor('sample-js', 'main.js');
    const issue = {
      fileUri,
      message: 'Somewhere, over the rainbow',
      severity: 'INFO',
      ruleKey: 'some:where',
      flows: [
        {
          locations: [
            {
              message: 'Way up',
              uri: fileUri,
              filePath: 'sample-js/main.js',
              textRange: {
                startLine: 1,
                startLineOffset: 0,
                endLine: 1,
                endLineOffset: 9
              },
              exists: true,
              codeMatches: true
            },
            {
              message: 'High',
              uri: fileUri,
              filePath: 'sample-js/main.js',
              textRange: {
                startLine: 2,
                startLineOffset: 2,
                endLine: 2,
                endLineOffset: 5
              },
              exists: true,
              codeMatches: true
            }
          ]
        },
        {
          locations: [
            {
              message: 'Way up',
              uri: fileUri,
              filePath: 'sample-js/main.js',
              textRange: {
                startLine: 1,
                startLineOffset: 0,
                endLine: 1,
                endLineOffset: 9
              },
              exists: true,
              codeMatches: true
            },
            {
              message: 'High',
              uri: fileUri,
              filePath: 'sample-js/main.js',
              textRange: {
                startLine: 2,
                startLineOffset: 6,
                endLine: 2,
                endLineOffset: 7
              },
              exists: true,
              codeMatches: true
            }
          ]
        }
      ],
      textRange: {
        startLine: 2,
        startLineOffset: 2,
        endLine: 2,
        endLineOffset: 5
      }
    };

    await underTest.showAllLocations(issue);

    const rootChildren = underTest.getChildren(null);
    expect(rootChildren).to.have.lengthOf(1);

    const rootNode = rootChildren[0] as IssueItem;
    expect(rootNode.label).to.equal('Somewhere, over the rainbow');

    const issueChildren = underTest.getChildren(rootNode);
    expect(issueChildren).to.have.lengthOf(2);

    const [flowNode1, flowNode2] = issueChildren as FlowItem[];
    expect(flowNode1.label).to.equal('Flow 1');
    expect(flowNode2.label).to.equal('Flow 2');

    const flowChildren1 = underTest.getChildren(flowNode1);
    expect(flowChildren1).to.have.lengthOf(2);
  });

  test('should show "highlight-only" locations', async () => {
    const underTest = new SecondaryLocationsTree();

    const fileUri = uriStringFor('sample-js', 'main.js');
    const issue = {
      fileUri,
      message: 'Somewhere, over the rainbow',
      severity: 'INFO',
      ruleKey: 'some:where',
      flows: [
        {
          locations: [
            {
              uri: fileUri,
              filePath: 'sample-js/main.js',
              textRange: {
                startLine: 1,
                startLineOffset: 0,
                endLine: 1,
                endLineOffset: 9
              },
              exists: true,
              codeMatches: true
            },
            {
              uri: fileUri,
              filePath: 'sample-js/main.js',
              textRange: {
                startLine: 2,
                startLineOffset: 2,
                endLine: 2,
                endLineOffset: 5
              },
              exists: true,
              codeMatches: true
            }
          ]
        }
      ],
      textRange: {
        startLine: 2,
        startLineOffset: 2,
        endLine: 2,
        endLineOffset: 5
      }
    };

    await underTest.showAllLocations(issue);

    const rootChildren = underTest.getChildren(null);
    expect(rootChildren).to.have.lengthOf(1);

    const rootNode = rootChildren[0] as IssueItem;
    expect(rootNode.label).to.equal('Somewhere, over the rainbow');

    const issueChildren = underTest.getChildren(rootNode);
    expect(issueChildren).to.be.empty;
  });

  test('should show full taint vulnerability locations', async () => {
    const underTest = new SecondaryLocationsTree();

    const mainUri = uriStringFor('sample-js', 'main.js');
    const sample1Uri = uriStringFor('sample-multi-js', 'folder1', 'sample.js');
    const sample2Uri = uriStringFor('sample-multi-js', 'folder2', 'sample.js');

    const issue = {
      fileUri: mainUri,
      message: 'Somewhere, over the rainbow',
      severity: 'BLOCKER',
      ruleKey: 'some:where',
      flows: [
        {
          locations: [
            {
              message: 'There it is!',
              uri: mainUri,
              filePath: 'sample-js/main.js',
              textRange: {
                startLine: 1,
                startLineOffset: 9,
                endLine: 1,
                endLineOffset: 12
              },
              exists: true,
              codeMatches: true
            },
            {
              message: 'Deeper',
              uri: sample2Uri,
              filePath: 'sample-multi-js/folder2/sample.js',
              textRange: {
                startLine: 2,
                startLineOffset: 3,
                endLine: 2,
                endLineOffset: 9
              },
              exists: true,
              codeMatches: true
            },
            {
              message: 'Deeper',
              uri: sample1Uri,
              filePath: 'sample-multi-js/folder1/sample.js',
              textRange: {
                startLine: 5,
                startLineOffset: 3,
                endLine: 5,
                endLineOffset: 9
              },
              exists: false,
              codeMatches: false
            },
            {
              message: 'Deeper',
              filePath: 'does/not/exist.js',
              textRange: {
                startLine: 0,
                startLineOffset: 1,
                endLine: 0,
                endLineOffset: 5
              },
              exists: false,
              codeMatches: false
            },
            {
              message: 'Deeper',
              uri: mainUri,
              filePath: 'sample-js/main.js',
              textRange: {
                startLine: 2,
                startLineOffset: 2,
                endLine: 2,
                endLineOffset: 12
              },
              exists: true,
              codeMatches: false
            },
            {
              message: 'Follow the white rabbit',
              uri: mainUri,
              filePath: 'sample-js/main.js',
              textRange: {
                startLine: 1,
                startLineOffset: 0,
                endLine: 1,
                endLineOffset: 9
              },
              exists: true,
              codeMatches: true
            }
          ]
        }
      ],
      textRange: {
        startLine: 2,
        startLineOffset: 2,
        endLine: 2,
        endLineOffset: 12
      }
    };

    await underTest.showAllLocations(issue);

    const rootChildren = underTest.getChildren(null);
    expect(rootChildren).to.have.lengthOf(1);

    const rootNode = rootChildren[0] as IssueItem;
    expect(rootNode.label).to.equal('Somewhere, over the rainbow');

    const flowChildren = underTest.getChildren(rootNode);
    expect(flowChildren).to.have.lengthOf(1);

    const fileChildren = underTest.getChildren(flowChildren[0]);
    expect(fileChildren).to.have.lengthOf(5);
    const [main1Node, notFoundNode, sample1Node, sample2Node, main2Node] = fileChildren as FileItem[];

    expect(underTest.getChildren(main1Node)[0].label).to.equal('1: Follow the white rabbit');
    expect(underTest.getChildren(main1Node)[1].label).to.equal('2: Deeper');
    expect(underTest.getChildren(notFoundNode)[0].label).to.equal('3: Deeper');
    expect(underTest.getChildren(sample1Node)[0].label).to.equal('4: Deeper');
    expect(underTest.getChildren(sample2Node)[0].label).to.equal('5: Deeper');
    expect(underTest.getChildren(main2Node)[0].label).to.equal('6: There it is!');
  });
});
