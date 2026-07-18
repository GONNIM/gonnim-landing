#!/bin/bash
# Local cron wrapper · Wanted Gigs Playwright crawler
# 등록일: 2026-07-18 (Sprint Radar Day 3 후속)
# 배경: GitHub Actions US IP · CloudFront WAF 차단 확정 · 로컬 KR IP 로 이관
# 참조: Sprint-Radar-Spec.md · scripts/crawl-wanted-gigs.ts

# nvm-managed Node 22 · pnpm 은 corepack 통해 사용
export PATH="/Users/gonnim/.nvm/versions/node/v22.15.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

REPO="/Users/gonnim/GON-Dev/gonnim-landing"
LOG_DIR="$HOME/.cache"
LOG="$LOG_DIR/gonnim-wanted-gigs-crawl.log"
TODAY=$(date '+%Y-%m-%d')
NOW=$(date '+%H:%M:%S')

mkdir -p "$LOG_DIR"

cd "$REPO" || {
    echo "[$TODAY $NOW] repo 진입 실패: $REPO" >> "$LOG"
    osascript -e 'display notification "gonnim-landing repo 진입 실패" with title "Wanted Gigs Crawl ERROR" sound name "Basso"' 2>/dev/null
    exit 1
}

{
    echo ""
    echo "=========================================="
    echo "Wanted Gigs Crawl @ $TODAY $NOW"
    echo "=========================================="
    OUT=$(pnpm exec tsx scripts/crawl-wanted-gigs.ts 2>&1)
    echo "$OUT"
    echo "--- run end @ $(date '+%H:%M:%S') ---"
} >> "$LOG" 2>&1

# Extract summary from log tail
SUMMARY=$(tail -20 "$LOG" | grep -oE "wanted-gigs · [a-z]+ · found=[0-9]+ new=[0-9]+ updated=[0-9]+" | tail -1)
ICON="✅"
SOUND="Glass"
if [ -z "$SUMMARY" ]; then
    SUMMARY="스크립트 실 실행 실패 (로그 확인)"
    ICON="❌"
    SOUND="Basso"
elif echo "$SUMMARY" | grep -q "failed"; then
    ICON="⚠️"
    SOUND="Basso"
fi

osascript -e "display notification \"$ICON $SUMMARY\" with title \"Wanted Gigs Crawl @ $NOW\" sound name \"$SOUND\"" 2>/dev/null

exit 0
