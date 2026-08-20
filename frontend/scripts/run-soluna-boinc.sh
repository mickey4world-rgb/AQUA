#!/usr/bin/env bash
# BOINC 実行ヘルパー（GHA ubuntu-latest 向け）
# - gui_rpc_auth.cfg の権限問題を回避
# - 結果 JSON を壊さないよう数値を正規化
set -euo pipefail

RUN_MINUTES="${RUN_MINUTES:-15}"
BRIEFING_ID="${BRIEFING_ID:?BRIEFING_ID required}"
PROJECT_URL="${BOINC_PROJECT_URL:-https://www.worldcommunitygrid.org}"
BOINC_ACCOUNT_KEY="${BOINC_ACCOUNT_KEY:?BOINC_ACCOUNT_KEY required}"
BASE="${PRODUCTION_URL:-https://www.aquacore.net}"
SECRET="${SOLUNA_CRON_SECRET:?SOLUNA_CRON_SECRET required}"

echo "=== BOINC 社会貢献 開始 ==="
echo "実行予定: ${RUN_MINUTES} 分 / briefingId: ${BRIEFING_ID}"

sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends boinc-client -qq
sudo systemctl enable --now boinc-client || true
sleep 5

AUTH_FILE="/var/lib/boinc-client/gui_rpc_auth.cfg"
if [ -f "$AUTH_FILE" ]; then
  sudo chmod a+r "$AUTH_FILE" || true
  # boinccmd は cwd の gui_rpc_auth.cfg も読む
  sudo cp "$AUTH_FILE" ./gui_rpc_auth.cfg
  sudo chmod a+r ./gui_rpc_auth.cfg
  BOINC_PASS="$(tr -d '\r\n' < ./gui_rpc_auth.cfg || true)"
else
  BOINC_PASS=""
  echo "::warning::gui_rpc_auth.cfg が見つかりません。権限なしで続行します。"
fi

boinc() {
  if [ -n "${BOINC_PASS}" ]; then
    boinccmd --passwd "${BOINC_PASS}" "$@"
  else
    boinccmd "$@"
  fi
}

echo "プロジェクトへ接続: ${PROJECT_URL}"
boinc --project_attach "${PROJECT_URL}" "${BOINC_ACCOUNT_KEY}" || true
sleep 8
boinc --project "${PROJECT_URL}" update || true
boinc --project "${PROJECT_URL}" resume || true
boinc --run_benchmarks || true
sleep 5
boinc --get_project_status || true

START_TIME=$(date +%s)
DEADLINE=$(( START_TIME + RUN_MINUTES * 60 ))
echo "計算ループ開始 → $(date -u -d "@${DEADLINE}" +%H:%M:%SZ 2>/dev/null || echo "${DEADLINE}")"

while [ "$(date +%s)" -lt "${DEADLINE}" ]; do
  boinc --get_tasks 2>/dev/null | grep -E "name|state|fraction_done|received_credit" | head -8 || true
  sleep 60
done

ACTUAL_MIN=$(( ($(date +%s) - START_TIME) / 60 ))
# grep -c が 0 件で exit 1 になっても改行付きの二重 "0" を出さない
TASKS_RAW="$(boinc --get_tasks 2>/dev/null | grep -c "state: uploaded" || true)"
TASKS="$(echo "${TASKS_RAW:-0}" | tr -dc '0-9' | head -c 8)"
TASKS="${TASKS:-0}"

CREDIT_RAW="$(boinc --get_project_status 2>/dev/null | grep -oP '(?<=user_total_credit: )\S+' | head -1 || true)"
CREDIT="$(echo "${CREDIT_RAW:-0}" | tr -dc '0-9.' | head -c 24)"
CREDIT="${CREDIT:-0}"

PROJECT_NAME_RAW="$(boinc --get_project_status 2>/dev/null | grep -oP '(?<=project_name: ).+' | head -1 || true)"
PROJECT_NAME="${PROJECT_NAME_RAW:-World Community Grid}"
# JSON 用に危険文字を除去
PROJECT_NAME_JSON="$(printf '%s' "${PROJECT_NAME}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')"

boinc --project "${PROJECT_URL}" detach || true
sudo systemctl stop boinc-client || true

echo "=== BOINC 結果 ==="
echo "実績: ${ACTUAL_MIN} 分, タスク ${TASKS} 件, クレジット ${CREDIT} cobblestones"
echo "プロジェクト: ${PROJECT_NAME} (${PROJECT_URL})"

PAYLOAD="$(python3 - <<PY
import json
print(json.dumps({
  "briefingId": "${BRIEFING_ID}",
  "creditGranted": float("${CREDIT}" or 0),
  "tasksCompleted": int("${TASKS}" or 0),
  "projectName": ${PROJECT_NAME_JSON},
  "projectUrl": "${PROJECT_URL}",
  "runMinutesActual": int("${ACTUAL_MIN}"),
}, ensure_ascii=False))
PY
)"

echo "report payload: ${PAYLOAD}"
HTTP_CODE=$(curl -sS -o /tmp/boinc-report.json -w "%{http_code}" \
  -X POST "${BASE%/}/api/soluna/boinc-report" \
  -H "Authorization: Bearer ${SECRET}" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}")
cat /tmp/boinc-report.json
echo ""
echo "HTTP ${HTTP_CODE}"
test "${HTTP_CODE}" -ge 200 && test "${HTTP_CODE}" -lt 300
