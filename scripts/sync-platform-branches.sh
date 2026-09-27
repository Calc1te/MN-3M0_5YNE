#!/usr/bin/env bash

set -euo pipefail

SOURCE_BRANCH="main"
MODE="merge"
TARGET_BRANCHES=("windows-build" "osx-build")

usage() {
  cat <<'EOF'
Usage:
  scripts/sync-platform-branches.sh [--source <branch>] [--mode merge|rebase] [target-branch...]

Examples:
  scripts/sync-platform-branches.sh
  scripts/sync-platform-branches.sh --mode rebase
  scripts/sync-platform-branches.sh --source main windows-build osx-build
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      SOURCE_BRANCH="${2:-}"
      shift 2
      ;;
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      TARGET_BRANCHES=("${TARGET_BRANCHES[@]:0:0}" "$@")
      break
      ;;
  esac
done

if [[ -z "$SOURCE_BRANCH" ]]; then
  echo "Source branch cannot be empty." >&2
  exit 1
fi

if [[ "$MODE" != "merge" && "$MODE" != "rebase" ]]; then
  echo "Unsupported mode: $MODE" >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Run this script inside a git repository." >&2
  exit 1
fi

if ! git show-ref --verify --quiet "refs/heads/$SOURCE_BRANCH"; then
  echo "Source branch '$SOURCE_BRANCH' does not exist." >&2
  exit 1
fi

if [[ ${#TARGET_BRANCHES[@]} -eq 0 ]]; then
  echo "At least one target branch is required." >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
SOURCE_HEAD="$(git rev-parse --short "$SOURCE_BRANCH")"

echo "Syncing from '$SOURCE_BRANCH' ($SOURCE_HEAD) using mode '$MODE'."

for target in "${TARGET_BRANCHES[@]}"; do
  if [[ "$target" == "$SOURCE_BRANCH" ]]; then
    echo "Skipping '$target' because it matches the source branch."
    continue
  fi

  if ! git show-ref --verify --quiet "refs/heads/$target"; then
    echo "Target branch '$target' does not exist." >&2
    exit 1
  fi

  temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/sync-${target//\//-}-XXXXXX")"

  echo
  echo "==> Updating '$target'"

  git -C "$REPO_ROOT" worktree add --quiet --detach "$temp_dir" "$target"
  git -C "$temp_dir" checkout --quiet "$target"

  if [[ "$MODE" == "merge" ]]; then
    if git -C "$temp_dir" merge --no-ff --no-edit "$SOURCE_BRANCH"; then
      echo "Merged '$SOURCE_BRANCH' into '$target'."
    else
      echo "Merge conflict while updating '$target'." >&2
      echo "Conflict worktree kept at: $temp_dir" >&2
      exit 1
    fi
  else
    if git -C "$temp_dir" rebase "$SOURCE_BRANCH"; then
      echo "Rebased '$target' onto '$SOURCE_BRANCH'."
    else
      echo "Rebase conflict while updating '$target'." >&2
      echo "Conflict worktree kept at: $temp_dir" >&2
      exit 1
    fi
  fi

  git -C "$REPO_ROOT" update-ref "refs/heads/$target" "$(git -C "$temp_dir" rev-parse HEAD)"
  git -C "$REPO_ROOT" worktree remove --force "$temp_dir" >/dev/null 2>&1 || true
done

echo
echo "Done."
