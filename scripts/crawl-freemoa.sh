#!/bin/bash
# 프리모아 크롤 wrapper (Playwright · SSL 우회 · KR IP)
# 크론: 15 12 * * 1-5 (매일 12:15 KST · Wanted Gigs 12:00 이후 · 월-금)
# 참조: scripts/crawl-freemoa.ts

export PATH="/Users/gonnim/.nvm/versions/node/v22.15.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

REPO="/Users/gonnim/GON-Dev/gonnim-landing"
LOG_DIR="$HOME/.cache"
LOG="$LOG_DIR/gonnim-freemoa-crawl.log"
NOW=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p "$LOG_DIR"

cd "$REPO" || {
    echo "[$NOW] repo 진입 실패: $REPO" >> "$LOG"
    osascript -e 'display notification "gonnim-landing repo 진입 실패" with title "Freemoa Crawl ERROR" sound name "Basso"' 2>/dev/null
    exit 1
}

{
    echo ""
    echo "=========================================="
    echo "Freemoa Crawl @ $NOW"
    echo "=========================================="
    OUT=$(pnpm exec tsx scripts/crawl-freemoa.ts 2>&1)
    echo "$OUT"
    echo "--- run end @ $(date '+%H:%M:%S') ---"
} >> "$LOG" 2>&1

SUMMARY=$(/usr/bin/tail -10 "$LOG" | /usr/bin/grep -oE "freemoa · [a-z]+ · found=[0-9]+ new=[0-9]+ updated=[0-9]+" | /usr/bin/tail -1)
ICON="✅"
SOUND="Glass"
if [ -z "$SUMMARY" ]; then
    SUMMARY="스크립트 실행 실패 (로그 확인)"
    ICON="❌"
    SOUND="Basso"
elif echo "$SUMMARY" | grep -q "failed"; then
    ICON="⚠️"
    SOUND="Basso"
fi

osascript -e "display notification \"$ICON $SUMMARY\" with title \"Freemoa Crawl\" sound name \"$SOUND\"" 2>/dev/null

exit 0
