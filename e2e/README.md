# Extension E2E tests

This suite installs the built VSIX into VS Code and checks diagnostics in real workspaces. The [development-host suite](../develop.md#running-tests) runs separately.

From the repository root, run:

```bash
./run-e2e.sh
```

The script packages the extension, resolves the Java sample dependencies with Maven and runs the E2E suite. Use a running display or install Xvfb when running on headless Linux.

With the VSIX already in the repository root and the Java sample dependencies prepared, run `npm install` then `npm test` from this directory. Set `VSCODE_VERSION` to test a specific VS Code version.
