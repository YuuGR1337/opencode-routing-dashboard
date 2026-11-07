#!/usr/bin/env bash
set -euo pipefail

if [ -n "${GITHUB_REF_NAME+x}" ]; then
  ref="$GITHUB_REF_NAME"
else
  ref=HEAD
fi

tag_commit=$(git rev-parse --verify "${ref}^{commit}")

if ! git fetch origin +refs/heads/main:refs/remotes/origin/main --quiet 2>/dev/null; then
  echo "FAIL: failed to fetch origin/main; refusing to trust a stale local ref"
  exit 1
fi

if git merge-base --is-ancestor "$tag_commit" origin/main; then
  echo "OK: $ref at $tag_commit is within main ancestry"
  exit 0
else
  echo "FAIL: tagged commit $tag_commit not reachable from origin/main (not an ancestor)"
  echo "main tip: $(git rev-parse origin/main 2>/dev/null || echo 'unknown')"
  exit 1
fi
