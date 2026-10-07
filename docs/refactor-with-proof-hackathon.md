# VS Code refactor with proof demo

This opt-in hackathon action uses the existing AI CodeFix endpoint and a local
Lean verification worker. No sonarlint-core, language-server or analyzer release
is required. It supports **one Rust function / one issue in a small Cargo library**.

## Run the Dev16 demo

1. Build `cognitive-verifier:integration` from the lean-into-verification repository:
   `docker build -f orchestrator/docker/Dockerfile -t cognitive-verifier:integration .`.
   Start Docker. Verification runs with `--network none`; dependencies must be cached.
2. Install the draft extension VSIX or launch the extension development host.
3. Open `demo/refactor-with-proof` as a trusted workspace and open `src/lib.rs`.
   Its `classify` function has cognitive complexity 36 with the local cogc metric.
4. Configure these workspace settings with an existing Dev16 organization/project
   where your user has project access and AI CodeFix is enabled:

   ```json
   {
     "sonarlint.refactorWithProof.enabled": true,
     "sonarlint.refactorWithProof.symbol": "crate::classify",
     "sonarlint.refactorWithProof.projectKey": "YOUR_DEV16_PROJECT",
     "sonarlint.refactorWithProof.organizationKey": "YOUR_DEV16_ORGANIZATION",
     "sonarlint.refactorWithProof.maxComplexity": 30
   }
   ```

5. Save all files. Run **SonarQube: Refactor with proof (Hackathon)** from the command
   palette or editor refactoring actions. The first direct request prompts for your
   **Dev16** token and stores it in VS Code SecretStorage, never workspace settings.
   Original translation must pass before generation starts.
   Optional `sonarlint.refactorWithProof.generationGuidance` adds explicit
   refactoring constraints to the direct Dev16 request. For the native ruint
   experiment, keep arithmetic and loop bodies unchanged and extract only the
   final even/odd matrix selection into private helpers. This guides generation;
   the worker still checks the exact returned patch independently.
6. Wait for preparation, Cloud generation and local verification. Inspect the result
   document (complexity, verdict, assumptions, AI explanation, artifacts) alongside
   the read-only original/candidate diff. Choose **Apply reviewed refactor** only
   after review. Existing project bytes are checked again before application.

The Cloud companion draft PR needs `deploy-GA-Dev16`. The adapter calls only
`https://api.sc-dev16.io/fix-suggestions/ai-suggestions`, using the existing
full-issue JSON contract. Authentication, access, enablement and usage limits remain
Cloud checks. No public extension marketplace publishing is part of this demo.

For the pinned real-world ruint target, set `symbol` to
`ruint::algorithms::gcd::matrix::{ruint::algorithms::gcd::matrix::Matrix}::from_u64_prefix`
and `charonSymbol` to `crate::algorithms::gcd::matrix::Matrix::from_u64_prefix`.
Use the native Cargo workspace and pinned dependency lock, with dependencies cached
in the verifier image. Its documented score is 27: threshold 15 reproduces the
experimental finding and is below Rust's production default of 30.

## Shortcuts and proof scope

When a real `rust:S3776` IDE diagnostic and native AI CodeFix action are available,
this action reuses them and their issue threshold. The installed extension currently
does not bundle the Rust analyzer, so the command can instead use cogc to measure
one explicitly configured function and send that measurement as a full issue.
The result labels this source **cogc (Hackathon demo)**. This is not a claim that
Sonar analyzed the crate. Match the configured threshold to the Cloud quality profile.

Verification establishes equality of **Aeneas-generated Lean models**. It does not
establish full Rust semantic coverage or audit all trusted external models. Cargo
library target, default features, Linux translation, no symlinks, no external path
dependencies, and at most 20 MB / 5,000 files are demo restrictions. Sonar analysis
must confirm issue resolution after application. New helpers are checked by the worker.

A timeout, unsupported translation, failed mechanical check or failed proof is
**not verified**, not automatically incorrect. The attempted candidate remains
reviewable. A worker counterexample is evidence about the translated models.
Progress can be cancelled; cancelled or late native responses never auto-apply.
Artifacts are retained under the extension's global storage `proof-*` directories.

## Build and verification

Use the normal `npm ci`, `npm run prepare`, `npm run webpack`, and VSIX packaging
workflow (Artifactory credentials are needed for private pinned dependencies).
`npm run test:proof` compiles and runs independent tests for exact line edits,
aggregate proof acceptance and source freshness. The local Docker smoke uses the
same exported snapshot / prepare / verify / patch functions as the extension.
