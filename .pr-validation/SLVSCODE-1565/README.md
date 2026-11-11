# PR #1294 validation evidence

Validated source: `a202195c40097e79116c1bf881ca790134a106cd` (rebased on master).
Published language server: **6.4.0.79986**; jar SHA-256:
`9d019c357306898c3a31d37225cc46a0d6c5a79b40202414d7ea0468a3c64f43`.
Linux, Java 21.0.13, Node 26.13.0; VS Code **1.100.0** and **1.139.1**.

## Native integration proof

- [Current stable GIF](1.139.1/native-picker.gif), [assertions and JSON-RPC trace](1.139.1/assertions.json), [HTTP requests](1.139.1/http-requests.json), [host log](1.139.1/native-host.log).
- [VS Code 1.100 GIF](1.100.0/native-picker.gif), [assertions and JSON-RPC trace](1.100.0/assertions.json), [HTTP requests](1.100.0/http-requests.json), [host log](1.100.0/native-host.log).

Each recording captures only its dedicated VS Code development window. Inputs are automated, with actual native QuickPick rendering and keyboard acceptance. GIFs are encoded from the captured window video without synthetic UI frames.

The harness loads the production compiled `BindingService` and client request methods, sends JSON-RPC over stdio to the **published SLLS jar and its bundled Core**, and serves SonarQube HTTP/protobuf responses from a local fixture. Search results and persistence are not stubbed. The fixture provides connection configuration; the Findings-view focus command is registered as a no-op because that view is absent from this isolated host. The full extension activation/setup flow and a live SonarQube deployment are outside this harness.

Each version asserts:

1. The initial catalogue contains `catalogue`, and excludes `needle`.
2. Enter during busy/loading saves nothing.
3. Whitespace input is trimmed to `needle` in the real JSON-RPC request.
4. Remote results contain the absent project: key `needle`, name `Zulu key-only match`. Both server results remain visible. Core's first result is active even though native display ordering places the name match above it.
5. Native keyboard navigation reaches the other displayed result.
6. Clearing input restores the original grouped catalogue immediately.
7. An empty server response leaves the native empty-list state without binding.
8. HTTP 500 clears results/busy, shows one nonmodal error, and permits a successful retry.
9. Native acceptance calls the actual save method once, writes `.vscode/settings.json` with `projectKey: needle`, and sends `sonarlint/addedManualBindings` once. A further acceptance does not save again.

This uses a deliberately small catalogue with an excluded project. It verifies discovery outside the initial response; it is not a 10,001-project load/performance test. The 10,000-project cap remains unchanged.

## Automated suite

- [Compilation and webpack log](pretest.log): passed.
- [Full extension-host suite](full-suite.log): **447 passing, 1 pending**. This includes all **12 deterministic project-search tests** with fake timers and deferred responses for the 300 ms debounce, single-character queries, default ID normalization, stale success/failure/finalizers, blank restoration, selection replacement, busy/empty/stale acceptance, browser buttons, dismissal, cleanup, and recovery. Those unit tests use controlled language-client responses.
- [Published-backend smoke log](published-backend.log), [HTTP trace](published-backend-http.json): real SLLS/Core catalogue exclusion, ordered search results, empty response, HTTP failure propagation, and unknown connection rejection.

No product files were changed during evidence collection. ANSI escapes and the local repository prefix were removed from shared terminal logs. The PR description links the separate CI checks; pending CI is not represented as passing.

Vortex DEEP was unavailable earlier in this session because system keychain access failed: `Failed to access the system keychain. Underlying error: Could not connect: Operation not permitted (code: 14)`. Per the repository protocol, it was not retried.

## Reproduce the native recording

These scripts are kept separately from the feature PR. Use the validated source revision and the published jar above, with normal repository dependencies installed. Linux requires an X11 display, ffmpeg, xwininfo, and Java 21. VS Code is launched in an isolated profile/workspace under this directory; no developer settings are modified.

From the repository root, with the evidence files available in a separate directory:

```sh
npm run pretest
node -e "Promise.all(['1.100.0', '1.139.1'].map(v => require('@vscode/test-electron').downloadAndUnzipVSCode(v)))"
SONARLINT_SEARCH_REPO="$PWD" node /path/to/evidence/run-native-proof.js 1.100.0
SONARLINT_SEARCH_REPO="$PWD" node /path/to/evidence/run-native-proof.js 1.139.1
```

The runner creates the fixture manifest, temporary project, isolated profile, assertion JSON, HTTP trace, and window-only MP4. A nonzero exit means an assertion or the host failed. The logs and recordings here came from the original run; the shared scripts only substitute the local repository fallback with the current directory and create the fixture directory if needed.
