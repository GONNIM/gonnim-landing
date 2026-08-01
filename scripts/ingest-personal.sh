#!/usr/bin/env bash
# Personal Ingest · zsh/bash wrapper
#
# 사용:
#   ./scripts/ingest-personal.sh "https://..."
#   pbpaste | ./scripts/ingest-personal.sh --stdin
#   ./scripts/ingest-personal.sh --file ~/Downloads/article.txt

set -euo pipefail
cd "$(dirname "$0")/.."
pnpm exec tsx scripts/ingest-personal.ts "$@"
