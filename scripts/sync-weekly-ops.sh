#!/bin/bash
# Weekly-Ops 자동 데이터 갱신 wrapper (P0-1)
# 등록일: 2026-07-18 (Sprint Radar Day 5)
# 크론: 0 20 * * 0 (매주 일요일 20:00 KST)
# 참조: gonnim-landing/scripts/sync-weekly-ops.ts · GON-LLM-Wiki/Weekly-Ops.md

export PATH="/Users/gonnim/.nvm/versions/node/v22.15.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

REPO="/Users/gonnim/GON-Dev/gonnim-landing"
LOG_DIR="$HOME/.cache"
LOG="$LOG_DIR/gonnim-weekly-ops.log"
NOW=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p "$LOG_DIR"

cd "$REPO" || {
    echo "[$NOW] repo 진입 실패: $REPO" >> "$LOG"
    osascript -e 'display notification "gonnim-landing repo 진입 실패" with title "Weekly-Ops Sync ERROR" sound name "Basso"' 2>/dev/null
    exit 1
}

{
    echo ""
    echo "=========================================="
    echo "Weekly-Ops Sync @ $NOW"
    echo "=========================================="
    OUT=$(pnpm exec tsx scripts/sync-weekly-ops.ts 2>&1)
    echo "$OUT"
    echo "--- run end @ $(date '+%H:%M:%S') ---"
} >> "$LOG" 2>&1

# 결과 요약 추출
SUMMARY=$(/usr/bin/tail -6 "$LOG" | /usr/bin/grep -oE "신규 [0-9]+ · 지원 [0-9]+ · 응답 [0-9]+ · 계약 [0-9]+ · Q1 [0-9]+%" | /usr/bin/tail -1)
ICON="✅"
SOUND="Glass"
if [ -z "$SUMMARY" ]; then
    if /usr/bin/tail -6 "$LOG" | /usr/bin/grep -q "이미 이번 주 자동 데이터 존재"; then
        SUMMARY="이번 주 데이터 이미 존재 · 재-append 스킵"
        ICON="ℹ️"
    else
        SUMMARY="Weekly-Ops sync 실패 (로그 확인)"
        ICON="❌"
        SOUND="Basso"
    fi
fi

osascript -e "display notification \"$ICON $SUMMARY\" with title \"Weekly-Ops Sync\" sound name \"$SOUND\"" 2>/dev/null

exit 0
