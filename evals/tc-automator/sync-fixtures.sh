#!/usr/bin/env bash
# before_run hook: builds fixtures/ from the repo so every task workspace is a copy of the real project.
# Waza skips symlinks when copying fixtures, so everything is copied as regular files (cp -L).
set -euo pipefail

eval_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$eval_dir/../.." && pwd)"
project="$eval_dir/fixtures/project"

if [[ ! -d "$repo_root/node_modules/@playwright/test" ]]; then
  echo "node_modules missing: run 'npm ci' in $repo_root first" >&2
  exit 1
fi

rm -rf "$eval_dir/fixtures"
mkdir -p "$project/tests" "$eval_dir/fixtures/manual-tcs"

cp "$repo_root/package.json" "$repo_root/package-lock.json" "$repo_root/playwright.config.ts" "$project/"
cp -r "$repo_root/tests/support" "$repo_root/tests/saucedemo.spec.ts" "$project/tests/"
cp -rL "$repo_root/node_modules" "$project/"
cp "$repo_root"/manual-tcs/*.md "$eval_dir/fixtures/manual-tcs/"

# Waza drops exec bits when copying fixtures, so node_modules/.bin/* can't run in the task workspace.
# Point `npm test` at Playwright's JS entry point instead; `npm test -- <spec>` then works the same as in the repo.
node -e '
  const fs = require("fs");
  const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  pkg.scripts.test = "node node_modules/@playwright/test/cli.js test";
  fs.writeFileSync(process.argv[1], JSON.stringify(pkg, null, 2) + "\n");
' "$project/package.json"
