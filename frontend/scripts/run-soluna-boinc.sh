#!/usr/bin/env bash
# BOINC 実行ヘルパー（GHA ubuntu-latest 向け）
# - gui_rpc_auth.cfg は /var/lib/boinc-client が一般ユーザー不可読なことがある → sudo で待つ・権限付与
# - 実績 POST は SWA の Bearer 認証（ルートは anonymous + アプリ側照合）
# - アカウント接続できないまま待機して「成功」扱いにしない
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

AUTH_FILE="/var/lib/boinc-client/gui_rpc_auth.cfg"
BOINC_PASS=""
echo "gui_rpc_auth.cfg を待機・権限付与中..."
for _ in $(seq 1 40); do
  if sudo test -f "${AUTH_FILE}"; then
    # ディレクトリごと読めないと boinccmd が失敗する
    sudo chmod a+rx /var/lib/boinc-client || true
    sudo chmod a+r "${AUTH_FILE}" || true
    sudo cp "${AUTH_FILE}" ./gui_rpc_auth.cfg
    sudo chmod a+r ./gui_rpc_auth.cfg
    BOINC_PASS="$(tr -d '\r\n' < ./gui_rpc_auth.cfg || true)"
    break
  fi
  sleep 1
done

if [ ! -f ./gui_rpc_auth.cfg ]; then
  echo "::error::gui_rpc_auth.cfg を読めません。BOINC RPC を制御できないため中止します。"
  exit 1
fi
echo "RPC auth 準備完了（passwd length=${#BOINC_PASS}）"

boinc() {
  # boinccmd がハングすると GHA が数時間止まるため上限を付ける
  if [ -n "${BOINC_PASS}" ]; then
    timeout 45 boinccmd --passwd "${BOINC_PASS}" "$@" || true
  else
    timeout 45 boinccmd "$@" || true
  fi
}

report_boinc() {
  local status_label="$1"
  local credit="$2"
  local tasks="$3"
  local actual_min="$4"
  local project_name_json
  project_name_json="$(printf '%s' "${PROJECT_NAME:-World Community Grid}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')"
  local payload
  payload="$(python3 - <<PY
import json
print(json.dumps({
  "briefingId": "${BRIEFING_ID}",
  "creditGranted": float("${credit}" or 0),
  "tasksCompleted": int("${tasks}" or 0),
  "projectName": ${project_name_json},
  "projectUrl": "${PROJECT_URL}",
  "runMinutesActual": int("${actual_min}"),
  "runStatus": "${status_label}",
}, ensure_ascii=False))
PY
)"
  echo "report payload: ${payload}"
  # -L は Authorization を落とすことがあるので付けない。SWA 側で anonymous 許可が必要。
  HTTP_CODE=$(curl -sS -o /tmp/boinc-report.json -w "%{http_code}" \
    -X POST "${BASE%/}/api/soluna/boinc-report" \
    -H "Authorization: Bearer ${SECRET}" \
    -H "Content-Type: application/json" \
    -d "${payload}")
  cat /tmp/boinc-report.json || true
  echo ""
  echo "HTTP ${HTTP_CODE}"
  if [ "${HTTP_CODE}" -lt 200 ] || [ "${HTTP_CODE}" -ge 300 ]; then
    echo "::error::boinc-report 失敗 HTTP ${HTTP_CODE}（SWA ルート認証や URL を確認）"
    return 1
  fi
  return 0
}

echo "プロジェクトへ接続: ${PROJECT_URL}"
boinc --project_attach "${PROJECT_URL}" "${BOINC_ACCOUNT_KEY}" || true
sleep 5
boinc --project "${PROJECT_URL}" update || true
boinc --project "${PROJECT_URL}" resume || true
boinc --run_benchmarks || true

ATTACHED=0
for _ in $(seq 1 36); do
  STATUS="$(boinc --get_project_status 2>/dev/null || true)"
  echo "${STATUS}" | head -40 || true
  USER_NAME="$(echo "${STATUS}" | grep -oP '(?<=user_name: ).+' | head -1 | tr -d '\r' || true)"
  if [ -n "${USER_NAME}" ]; then
    ATTACHED=1
    echo "アカウント接続確認: user_name=${USER_NAME}"
    break
  fi
  # スケジューラ待ち
  boinc --project "${PROJECT_URL}" update || true
  sleep 5
done

PROJECT_NAME_RAW="$(boinc --get_project_status 2>/dev/null | grep -oP '(?<=project_name: ).+' | head -1 || true)"
PROJECT_NAME="${PROJECT_NAME_RAW:-World Community Grid}"

if [ "${ATTACHED}" -ne 1 ]; then
  echo "::error::World Community Grid へのアカウント接続に失敗（user_name 空）。計算せずに報告して終了します。"
  report_boinc "error" "0" "0" "0" || true
  exit 1
fi

# CI では長時間ジョブが枠を食うため、実計算は最大 25 分にキャップ（計画分がそれ以下なら計画どおり）
if [ "${RUN_MINUTES}" -gt 25 ]; then
  echo "::notice::計画 ${RUN_MINUTES} 分 → CI キャップ 25 分で実行"
  RUN_MINUTES=25
fi

START_TIME=$(date +%s)
DEADLINE=$(( START_TIME + RUN_MINUTES * 60 ))
echo "計算ループ開始 → deadline epoch ${DEADLINE} (${RUN_MINUTES} min)"

while [ "$(date +%s)" -lt "${DEADLINE}" ]; do
  boinc --get_tasks 2>/dev/null | grep -E "name|state|fraction_done|received_credit" | head -8 || true
  sleep 60
done

ACTUAL_MIN=$(( ($(date +%s) - START_TIME) / 60 ))
TASKS_RAW="$(boinc --get_tasks 2>/dev/null | grep -c "state: uploaded" || true)"
TASKS="$(echo "${TASKS_RAW:-0}" | tr -dc '0-9' | head -c 8)"
TASKS="${TASKS:-0}"

CREDIT_RAW="$(boinc --get_project_status 2>/dev/null | grep -oP '(?<=user_total_credit: )\S+' | head -1 || true)"
CREDIT="$(echo "${CREDIT_RAW:-0}" | tr -dc '0-9.' | head -c 24)"
CREDIT="${CREDIT:-0}"

boinc --project "${PROJECT_URL}" detach || true
sudo systemctl stop boinc-client || true

echo "=== BOINC 結果 ==="
echo "実績: ${ACTUAL_MIN} 分, タスク ${TASKS} 件, クレジット ${CREDIT} cobblestones"
echo "プロジェクト: ${PROJECT_NAME} (${PROJECT_URL})"

# 稼働はした。タスク0でも接続済みなら done（短時間では uploaded まで届かないことがある）
report_boinc "done" "${CREDIT}" "${TASKS}" "${ACTUAL_MIN}"
