#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

npm i
npm run package

# Resolve Maven dependencies for Java samples before running E2E tests
cd e2e/samples/sample-java-maven-multi-module
mvn dependency:resolve -q
cd ../../..

cd e2e
npm i
npm test
