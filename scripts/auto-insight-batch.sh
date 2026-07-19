#!/bin/bash
# 자동 사업화 타당성 분석 배치 wrapper (Phase B · Sprint W1)
# 크론: 0 15 * * * (매일 15:00 KST · Wishket 08:00 + Wanted Gigs 12:00 크롤 이후)
# 참조: scripts/auto-insight-batch.ts · Sprint-Radar-Spec

export PATH="/Users/gonnim/.nvm/versions/node/v22.15.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

REPO="/Users/gonnim/GON-Dev/gonnim-landing"
LOG_DIR="$HOME/.cache"
LOG="$LOG_DIR/gonnim-auto-insight.log"
NOW=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p "$LOG_DIR"

cd "$REPO" || {
    echo "[$NOW] repo 진입 실패: $REPO" >> "$LOG"
    osascript -e 'display notification "gonnim-landing repo 진입 실패" with title "Auto Insight ERROR" sound name "Basso"' 2>/dev/null
    exit 1
}

{
    echo ""
    echo "=========================================="
    echo "Auto Insight Batch @ $NOW"
    echo "=========================================="
    pnpm exec tsx scripts/auto-insight-batch.ts 2>&1
    echo "--- run end @ $(date '+%H:%M:%S') ---"
} >> "$LOG" 2>&1

exit 0
