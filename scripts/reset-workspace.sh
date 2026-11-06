#!/usr/bin/env bash
# Fresh copy of the demo codebase as its own git repo, with no worktrees.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
rm -rf "$root/workspace"
mkdir -p "$root/workspace"
cp -R "$root/demo-app" "$root/workspace/shopkit"
cd "$root/workspace/shopkit"
git init -q -b main
git add -A
git -c user.name="Fixline Crew" -c user.email=crew@fixline.local commit -q -m "shopkit 1.4.0"
echo "workspace/shopkit reset at $(git rev-parse --short HEAD)"
