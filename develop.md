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

Packaging, publishing
---------------------

Verify `package.json` content, especially version.

Verify the package versions to download in `scripts/prepare.mjs`.

TODO

Useful links
------------

- https://code.visualstudio.com/docs/extensions/overview
- https://code.visualstudio.com/docs/extensions/developing-extensions
