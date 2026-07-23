#!/bin/bash
# 트렌드 launch 사업화 판정 배치 wrapper (P-LLM-Judge · Sprint W1)
# 크론: 0 10 * * * (매일 10:00 KST · Product Hunt 09:30 크롤 이후)

export PATH="/Users/gonnim/.nvm/versions/node/v22.15.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

REPO="/Users/gonnim/GON-Dev/gonnim-landing"
LOG_DIR="$HOME/.cache"
LOG="$LOG_DIR/gonnim-trend-judge.log"
NOW=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p "$LOG_DIR"

cd "$REPO" || {
    echo "[$NOW] repo 진입 실패: $REPO" >> "$LOG"
    osascript -e 'display notification "gonnim-landing repo 진입 실패" with title "Trend Judge ERROR" sound name "Basso"' 2>/dev/null
    exit 1
}

{
    echo ""
    echo "=========================================="
    echo "Trend Judge Batch @ $NOW"
    echo "=========================================="
    pnpm exec tsx scripts/judge-trend-launches.ts 2>&1
    echo "--- run end @ $(date '+%H:%M:%S') ---"
} >> "$LOG" 2>&1

exit 0
