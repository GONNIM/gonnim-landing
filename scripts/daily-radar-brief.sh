#!/bin/bash
# Sprint Radar 매일 브리핑 wrapper · 첫 결제 지원 도구
# 크론: 30 8 * * * (매일 08:30 KST · Wishket 08:00 크롤 이후 · 사용자 30분 지원 세션 직전)

export PATH="/Users/gonnim/.nvm/versions/node/v22.15.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

REPO="/Users/gonnim/GON-Dev/gonnim-landing"
LOG_DIR="$HOME/.cache"
LOG="$LOG_DIR/gonnim-radar-brief.log"
NOW=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p "$LOG_DIR"

cd "$REPO" || {
    echo "[$NOW] repo 진입 실패: $REPO" >> "$LOG"
    osascript -e 'display notification "gonnim-landing repo 진입 실패" with title "Radar Brief ERROR" sound name "Basso"' 2>/dev/null
    exit 1
}

{
    echo ""
    echo "=========================================="
    echo "Radar Brief @ $NOW"
    echo "=========================================="
    pnpm exec tsx scripts/daily-radar-brief.ts 2>&1
    echo "--- run end @ $(date '+%H:%M:%S') ---"
} >> "$LOG" 2>&1

exit 0
