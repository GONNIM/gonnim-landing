#!/bin/bash
# Hugging Face Trending Models fetch wrapper (P-Trend-G · Sprint W1)
# 크론: 35 9 * * * (매일 09:35 KST · Product Hunt 09:30 이후)

export PATH="/Users/gonnim/.nvm/versions/node/v22.15.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

REPO="/Users/gonnim/GON-Dev/gonnim-landing"
LOG_DIR="$HOME/.cache"
LOG="$LOG_DIR/gonnim-hugging-face.log"
NOW=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p "$LOG_DIR"

cd "$REPO" || {
    echo "[$NOW] repo 진입 실패: $REPO" >> "$LOG"
    osascript -e 'display notification "gonnim-landing repo 진입 실패" with title "HF Trend ERROR" sound name "Basso"' 2>/dev/null
    exit 1
}

{
    echo ""
    echo "=========================================="
    echo "Hugging Face Fetch @ $NOW"
    echo "=========================================="
    OUT=$(pnpm exec tsx scripts/fetch-hugging-face.ts 2>&1)
    echo "$OUT"
    echo "--- run end @ $(date '+%H:%M:%S') ---"
} >> "$LOG" 2>&1

SUMMARY=$(/usr/bin/tail -8 "$LOG" | /usr/bin/grep -oE "filtered.*: [0-9]+" | /usr/bin/tail -1)
ICON="🤗"
SOUND="Glass"
if [ -z "$SUMMARY" ]; then
    SUMMARY="스크립트 실행 실패 (로그 확인)"
    ICON="❌"
    SOUND="Basso"
fi

osascript -e "display notification \"$ICON $SUMMARY\" with title \"Hugging Face Digest\" sound name \"$SOUND\"" 2>/dev/null

exit 0
