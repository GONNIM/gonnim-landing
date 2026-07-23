#!/bin/bash
# Product Hunt trend fetch wrapper (P-Trend-A · Sprint W1)
# 크론: 30 9 * * * (매일 09:30 KST)
# 참조: scripts/fetch-product-hunt.ts · Wiki Thoughts/Trends/Product-Hunt/

export PATH="/Users/gonnim/.nvm/versions/node/v22.15.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

REPO="/Users/gonnim/GON-Dev/gonnim-landing"
LOG_DIR="$HOME/.cache"
LOG="$LOG_DIR/gonnim-product-hunt.log"
NOW=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p "$LOG_DIR"

cd "$REPO" || {
    echo "[$NOW] repo 진입 실패: $REPO" >> "$LOG"
    osascript -e 'display notification "gonnim-landing repo 진입 실패" with title "PH Trend ERROR" sound name "Basso"' 2>/dev/null
    exit 1
}

{
    echo ""
    echo "=========================================="
    echo "Product Hunt Fetch @ $NOW"
    echo "=========================================="
    OUT=$(pnpm exec tsx scripts/fetch-product-hunt.ts 2>&1)
    echo "$OUT"
    echo "--- run end @ $(date '+%H:%M:%S') ---"
} >> "$LOG" 2>&1

# Summary · macOS 알림
SUMMARY=$(/usr/bin/tail -10 "$LOG" | /usr/bin/grep -oE "matched.*: [0-9]+" | /usr/bin/tail -1)
ICON="🌟"
SOUND="Glass"
if [ -z "$SUMMARY" ]; then
    SUMMARY="스크립트 실행 실패 (로그 확인)"
    ICON="❌"
    SOUND="Basso"
elif echo "$SUMMARY" | grep -q "matched.*: 0"; then
    SUMMARY="$SUMMARY (신규 없음)"
    ICON="ℹ️"
fi

osascript -e "display notification \"$ICON $SUMMARY\" with title \"Product Hunt Digest\" sound name \"$SOUND\"" 2>/dev/null

exit 0
