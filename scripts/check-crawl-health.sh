#!/bin/bash
# Crawl 상태 감지 wrapper (Sprint W1 Day 5+ · 데이터 유실 방지)
# 크론: 0 14 * * * (매일 14:00 KST · Wishket 08:00 + Wanted Gigs 12:00 이후)
# 참조: scripts/check-crawl-health.ts · Sprint-Radar-Spec

export PATH="/Users/gonnim/.nvm/versions/node/v22.15.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

REPO="/Users/gonnim/GON-Dev/gonnim-landing"
LOG_DIR="$HOME/.cache"
LOG="$LOG_DIR/gonnim-crawl-health.log"
NOW=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p "$LOG_DIR"

cd "$REPO" || {
    echo "[$NOW] repo 진입 실패: $REPO" >> "$LOG"
    osascript -e 'display notification "gonnim-landing repo 진입 실패" with title "Crawl Health ERROR" sound name "Basso"' 2>/dev/null
    exit 1
}

{
    echo ""
    echo "=========================================="
    echo "Crawl Health Check @ $NOW"
    echo "=========================================="
    pnpm exec tsx scripts/check-crawl-health.ts 2>&1
    echo "--- run end @ $(date '+%H:%M:%S') ---"
} >> "$LOG" 2>&1

exit 0
