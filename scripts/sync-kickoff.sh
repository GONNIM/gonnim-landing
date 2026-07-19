#!/bin/bash
# Obsidian Kickoff 자동 동기화 wrapper (Phase E · Sprint W1)
# 크론: 0 22 * * * (매일 22:00 KST)
# 참조: scripts/sync-kickoff.ts · GON-LLM-Wiki/Goals/2026-1억-Sprint/Kickoff.md

export PATH="/Users/gonnim/.nvm/versions/node/v22.15.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

REPO="/Users/gonnim/GON-Dev/gonnim-landing"
LOG_DIR="$HOME/.cache"
LOG="$LOG_DIR/gonnim-sync-kickoff.log"
NOW=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p "$LOG_DIR"

cd "$REPO" || {
    echo "[$NOW] repo 진입 실패: $REPO" >> "$LOG"
    osascript -e 'display notification "gonnim-landing repo 진입 실패" with title "Kickoff Sync ERROR" sound name "Basso"' 2>/dev/null
    exit 1
}

{
    echo ""
    echo "=========================================="
    echo "Kickoff Sync @ $NOW"
    echo "=========================================="
    pnpm exec tsx scripts/sync-kickoff.ts 2>&1
    echo "--- run end @ $(date '+%H:%M:%S') ---"
} >> "$LOG" 2>&1

exit 0
