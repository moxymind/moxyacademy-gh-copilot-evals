#!/usr/bin/env bash
# Program grader: runs the generated spec against saucedemo.com inside the task workspace.
# Usage: run-generated-test.sh <TC-ID>
set -euo pipefail

spec="tests/generated/$1.spec.ts"
cd "${WAZA_WORKSPACE_DIR:?WAZA_WORKSPACE_DIR not set}"

if [[ ! -f "$spec" ]]; then
  echo "FAIL: $spec was not created"
  exit 1
fi

if grep -nE 'test\.(skip|fixme|fail|only)\(' "$spec"; then
  echo "FAIL: $spec skips, disables or focuses tests"
  exit 1
fi

npm test --silent -- "$spec" --reporter=line --retries=0
