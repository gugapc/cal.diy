#!/usr/bin/env bash
# Prints the GitHub compare URL for opening a PR from the current branch.
#
# Exists because the remote here is an SSH URL with a custom host alias
# (git@github-personal:owner/repo.git). Naive string surgery turns that into
# https://github-personal/... which 404s; the alias is an ~/.ssh/config name,
# not a hostname. Only owner/repo is carried over, onto github.com.
#
# Usage: compare-url.sh [branch] [base]   # defaults: current branch, main
set -euo pipefail

branch="${1:-$(git rev-parse --abbrev-ref HEAD)}"
base="${2:-main}"

if [ "$branch" = "$base" ]; then
  echo "On '$base' — there is nothing to compare. Create a branch first." >&2
  exit 1
fi

remote_url="$(git remote get-url origin)"

# Keep the last two path segments (owner/repo) from any of:
#   git@host:owner/repo.git | ssh://git@host/owner/repo.git | https://host/owner/repo.git
slug="$(printf '%s' "$remote_url" | sed -E 's#\.git$##; s#^.*[:/]([^/:]+/[^/]+)$#\1#')"

if [ "$slug" = "$remote_url" ] || [ "${slug%/*}" = "$slug" ]; then
  echo "Could not read owner/repo out of origin: $remote_url" >&2
  exit 1
fi

if ! git rev-parse --verify --quiet "refs/remotes/origin/$branch" >/dev/null; then
  echo "Warning: origin/$branch does not exist yet — push before opening the PR." >&2
fi

echo "https://github.com/$slug/compare/$base...$branch?expand=1"
