#!/usr/bin/env bash

set -euvo pipefail

WORK_DIR=$(dirname "$0")
pushd "$WORK_DIR"
rm -rf dist/
npm run webpack
code --extensionDevelopmentPath="${WORK_DIR}"
popd
