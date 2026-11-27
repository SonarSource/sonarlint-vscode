Development notes
=================

Notes for developers of this extension.

Working on this package
-----------------------

### General tips

Install dependencies:

    npm install

Download resources (language server and analyzers):

    node scripts/prepare.mjs

Press `F5` to launch a new VSCode instance with the extension installed.

Open **Problems** panel with `control shift m` (or search for "Problems" with `F1`).

### Running tests

Run `npm test` from the repository root for unit tests and integration tests in the VS Code development host. Run `npm run test-build` for the build-script tests.

Run `./run-e2e.sh` to package the extension, install the VSIX into VS Code and test diagnostics in sample workspaces. See the [extension E2E guide](e2e/README.md) for prerequisites.

Packaging, publishing
---------------------

Verify `package.json` content, especially version.

Verify the package versions to download in `scripts/prepare.mjs`.

TODO

Useful links
------------

- https://code.visualstudio.com/docs/extensions/overview
- https://code.visualstudio.com/docs/extensions/developing-extensions
