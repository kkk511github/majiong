#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

release=0.7.9-build46
version=0.7.9
base=/opt/jinling-mahjong
directory="$base/releases/$release"
audit="$base/database-backups/$release-deploy"
game_container=jinling-mahjong-mahjong-1
telegram_container=jinling-mahjong-reports-telegram-reports-1

exec 9>"$base/deploy.lock"
flock -n 9
test -f "$audit/PREPARED"
test ! -f "$audit/ACTIVATED"
previous=$(cat "$audit/previous-release.txt")
test "$previous" = "$base/releases/0.7.8-build45"
test "$(readlink -f "$base/current")" = "$previous"
test "$(docker inspect --format '{{.Image}}' "$game_container")" = "$(cat "$audit/previous-image-id.txt")"
test "$(docker image inspect --format '{{.Id}}' "jinling-mahjong:$release")" = "$(cat "$audit/new-image-id.txt")"
sha256sum -c "$audit/verifiers.sha256"
sha256sum -c "$audit/preflight.sha256"
cd "$directory"
sha256sum -c "$audit/source-manifest.sha256"
python3 - <<'VERIFY_SOURCE'
import hashlib, json, pathlib
for rel, expected in json.load(open('release-source-manifest.json')).items():
    path = pathlib.Path(rel)
    assert path.is_file() and not path.is_symlink() and hashlib.sha256(path.read_bytes()).hexdigest() == expected, rel
VERIFY_SOURCE
docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.Config.Image}}' "$telegram_container" > "$audit/telegram-before-activate.txt"

# Refuse the switch when a human is seated online or a hand is still running.
docker exec -i -e CHECK_IDLE=1 -e BACKUP_PATH="/app/data/pre-$release-final.sqlite" "$game_container" node --input-type=module < "$audit/snapshot.mjs" > "$audit/before-switch.json"
docker cp "$game_container:/app/data/pre-$release-final.sqlite" "$audit/final-backup.sqlite"
chmod 600 "$audit/final-backup.sqlite"
sha256sum "$audit/final-backup.sqlite" > "$audit/final-backup.sha256"

wait_health() {
  local expected=$1 ready=0
  for attempt in $(seq 1 45); do
    if curl --fail --silent --max-time 2 http://127.0.0.1:18887/api/health | python3 -c 'import json,sys; assert json.load(sys.stdin)["version"] == sys.argv[1]' "$expected" 2>/dev/null; then ready=1; break; fi
    sleep 1
  done
  test "$ready" = 1
}
rollback() {
  local code=$?
  trap - ERR
  set +e
  docker logs --tail 120 "$game_container" > "$audit/failed-service.log" 2>&1
  cd "$previous"
  docker compose -p jinling-mahjong up -d --no-build --no-deps mahjong > "$audit/rollback.log" 2>&1
  local restore=$?
  ln -sfn "$previous" "$base/current"
  wait_health 0.7.8
  local healthy=$?
  if test "$restore" = 0 && test "$healthy" = 0; then
    echo 'Build 46 verification failed; previous application image is healthy again. Database backup is retained.' >&2
  else
    echo "ROLLBACK NEEDS ATTENTION: inspect $audit/rollback.log and the game service." >&2
  fi
  date -u +%FT%TZ > "$audit/ROLLED_BACK"
  exit "$code"
}
docker exec -i -e CHECK_IDLE=1 "$game_container" node --input-type=module < "$audit/snapshot.mjs" > "$audit/immediate-before-switch.json"
python3 "$audit/compare.py" "$audit/before-switch.json" "$audit/immediate-before-switch.json"
echo 'Switching only the Mahjong game service to build 46.'
trap rollback ERR
docker compose -p jinling-mahjong up -d --no-build --no-deps mahjong > "$audit/activate.log" 2>&1
wait_health "$version"
test "$(docker inspect --format '{{.Image}}' "$game_container")" = "$(cat "$audit/new-image-id.txt")"
docker exec -i "$game_container" node --input-type=module < "$audit/snapshot.mjs" > "$audit/after-switch.json"
python3 "$audit/compare.py" "$audit/immediate-before-switch.json" "$audit/after-switch.json" preserve
docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.Config.Image}}' "$telegram_container" > "$audit/telegram-after-activate.txt"
cmp "$audit/telegram-before-activate.txt" "$audit/telegram-after-activate.txt"
ln -sfn "$directory" "$base/current"
date -u +%FT%TZ > "$audit/ACTIVATED"
trap - ERR
curl --fail --silent --max-time 5 http://127.0.0.1:18887/api/health
printf '\nACTIVATED %s; historical data preserved and Telegram unchanged.\n' "$release"
