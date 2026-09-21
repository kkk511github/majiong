#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

release=0.7.9-build46
version=0.7.9
expected_sha=${1:?Usage: prepare-release-0.7.9-build46.sh ARCHIVE_SHA256}
resume=${2:-}
[[ "$expected_sha" =~ ^[a-f0-9]{64}$ ]]
test -z "$resume" || test "$resume" = --resume
base=/opt/jinling-mahjong
expected_previous="$base/releases/0.7.8-build45"
previous=$(readlink -f "$base/current")
directory="$base/releases/$release"
archive="/tmp/jinling-deploy-$release.tar.gz"
audit="$base/database-backups/$release-deploy"
check_container=jinling-mahjong-check-build46
game_container=jinling-mahjong-mahjong-1
telegram_container=jinling-mahjong-reports-telegram-reports-1

exec 9>"$base/deploy.lock"
flock -n 9
test "$previous" = "$expected_previous"
test "$(docker inspect --format '{{.Config.Image}}' "$game_container")" = jinling-mahjong:0.7.8-build45
test "$(docker inspect --format '{{.State.Health.Status}}' "$game_container")" = healthy
if test "$resume" = --resume; then
  test -d "$directory"
  test -d "$audit"
  test ! -f "$audit/PREPARED"
else
  test ! -e "$directory"
  test ! -e "$audit"
fi
printf '%s  %s\n' "$expected_sha" "$archive" | sha256sum -c -

# Validate member paths before extracting the source archive as root.
python3 - "$archive" "$directory" "$resume" <<'VERIFY_ARCHIVE'
import pathlib, sys, tarfile
with tarfile.open(sys.argv[1], 'r:gz') as archive:
    for member in archive.getmembers():
        path = pathlib.PurePosixPath(member.name)
        assert not path.is_absolute() and '..' not in path.parts, member.name
        assert member.isfile() or member.isdir(), member.name
    if sys.argv[3] == '--resume':
        member = next(member for member in archive.getmembers() if pathlib.PurePosixPath(member.name) == pathlib.PurePosixPath('release-source-manifest.json'))
        assert archive.extractfile(member).read() == (pathlib.Path(sys.argv[2]) / 'release-source-manifest.json').read_bytes(), 'Resume manifest differs from the uploaded archive'
VERIFY_ARCHIVE
install -d -m 700 "$directory" "$audit"
if test "$resume" != --resume; then
  tar --no-same-owner --warning=no-unknown-keyword -xzf "$archive" -C "$directory"
fi
printf 'MAHJONG_RELEASE=%s\n' "$release" > "$directory/.env"
cd "$directory"
python3 - "$version" <<'VERIFY_SOURCE'
import hashlib, json, pathlib, sys
manifest = json.load(open('release-source-manifest.json'))
assert isinstance(manifest, dict) and manifest
for rel, expected in manifest.items():
    path = pathlib.Path(rel)
    assert not path.is_absolute() and '..' not in path.parts, rel
    assert path.is_file() and not path.is_symlink(), rel
    assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, rel
assert json.load(open('package.json'))['version'] == sys.argv[1]
print('Frozen source manifest verified:', len(manifest), 'files')
VERIFY_SOURCE
if test "$resume" = --resume; then
  sha256sum .env.example > "$audit/supplemental-source.sha256"
fi
docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.Config.Image}}' "$telegram_container" > "$audit/telegram-before.txt"
docker inspect --format '{{.Image}}' "$game_container" > "$audit/previous-image-id.txt"
printf '%s\n' "$previous" > "$audit/previous-release.txt"
printf '%s\n' "$expected_sha" > "$audit/archive-sha256.txt"
sha256sum release-source-manifest.json > "$audit/source-manifest.sha256"

install -d docs/research
echo 'Building build 46 while the current game service remains running.'
docker compose -p jinling-mahjong build mahjong > "$base/build-$release.log" 2>&1
docker image inspect --format '{{.Id}}' "jinling-mahjong:$release" > "$audit/new-image-id.txt"
echo 'Running the full Linux unit-test suite in the release image.'
docker run --rm --network none "jinling-mahjong:$release" npm test -- --maxWorkers=2 > "$base/test-$release.log" 2>&1
tail -8 "$base/test-$release.log"

cat > "$audit/snapshot.mjs" <<'SNAPSHOT'
import { DatabaseSync, backup } from 'node:sqlite';
import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const encode = value => JSON.stringify(value, (_, item) =>
  typeof item === 'bigint' ? { bigint: item.toString() } :
  item instanceof Uint8Array ? { bytes: Buffer.from(item).toString('base64') } : item);
const db = new DatabaseSync(process.env.DATABASE_PATH || '/app/data/mahjong.sqlite', { readOnly: true });
db.exec('BEGIN');
const rooms = db.prepare('SELECT state FROM rooms').all().map(row => JSON.parse(row.state));
const onlineHumans = rooms.flatMap(room => room.players).filter(player => player && !player.bot && player.online).length;
const playing = rooms.filter(room => ['playing', 'claiming'].includes(room.phase)).length;
const tables = {};
for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
  if (['sessions', 'rooms'].includes(name)) continue;
  const quoted = '"' + name.replaceAll('"', '""') + '"';
  const rows = db.prepare('SELECT * FROM ' + quoted).all().map(row => hash(encode(row))).sort();
  tables[name] = { count: rows.length, digest: hash(encode(rows)), rows };
}
const ledger = rooms.map(room => ({
  id: room.id, rules: room.rules, initialScore: room.initialScore,
  settlementBase: room.settlementBase, scoreDivisor: room.scoreDivisor,
  players: room.players.map(player => player && ({ id: player.id, score: player.score, externalScore: player.externalScore })),
  history: room.history,
})).map(row => hash(encode(row))).sort();
db.exec('COMMIT');
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), onlineHumans, playing, tables, roomLedger: ledger }));
if (process.env.CHECK_IDLE === '1' && (onlineHumans || playing)) {
  db.close();
  console.error('Active players or hands detected; production switch refused.');
  process.exit(2);
}
if (process.env.BACKUP_PATH) await backup(db, process.env.BACKUP_PATH);
db.close();
SNAPSHOT
cat > "$audit/compare.py" <<'COMPARE'
import collections, json, sys
before, after = [json.load(open(path)) for path in sys.argv[1:3]]
exact = len(sys.argv) < 4 or sys.argv[3] != 'preserve'
for name, expected in before['tables'].items():
    actual = after['tables'].get(name)
    assert actual is not None, ('missing table', name)
    if exact:
        assert actual['count'] == expected['count'] and actual['digest'] == expected['digest'], ('changed historical data', name)
    else:
        assert not (collections.Counter(expected['rows']) - collections.Counter(actual['rows'])), ('changed/deleted historical rows', name)
if exact:
    assert before['roomLedger'] == after['roomLedger'], 'Existing table rules or balances changed'
print('Historical records, balances, and external liability data verified.')
COMPARE
sha256sum "$audit/snapshot.mjs" "$audit/compare.py" > "$audit/verifiers.sha256"

# Rehearse an idle snapshot so timers cannot generate new game results in the copy.
docker exec -i -e CHECK_IDLE=1 -e BACKUP_PATH="/app/data/pre-$release.sqlite" "$game_container" node --input-type=module < "$audit/snapshot.mjs" > "$audit/production-observed.json"
docker cp "$game_container:/app/data/pre-$release.sqlite" "$audit/rehearsal-backup.sqlite"
chmod 600 "$audit/rehearsal-backup.sqlite"
check_data="$audit/rehearsal-data"
install -d -m 700 "$check_data"
cp "$audit/rehearsal-backup.sqlite" "$check_data/mahjong.sqlite"
chown -R 1000:1000 "$check_data"
docker run --rm -i --network none -v "$check_data:/app/data" --entrypoint node "jinling-mahjong:$release" --input-type=module < "$audit/snapshot.mjs" > "$audit/rehearsal-before.json"
cleanup_check() { docker rm -f "$check_container" >/dev/null 2>&1 || true; }
trap cleanup_check EXIT
docker run -d --name "$check_container" -p 127.0.0.1:18888:8787 -e DATABASE_PATH=/app/data/mahjong.sqlite -v "$check_data:/app/data" "jinling-mahjong:$release" > /dev/null
ready=0
for attempt in $(seq 1 45); do
  if curl --fail --silent --max-time 2 http://127.0.0.1:18888/api/health | python3 -c 'import json,sys; assert json.load(sys.stdin)["version"] == sys.argv[1]' "$version" 2>/dev/null; then ready=1; break; fi
  sleep 1
done
test "$ready" = 1
docker exec -i "$check_container" node --input-type=module < "$audit/snapshot.mjs" > "$audit/rehearsal-after.json"
python3 "$audit/compare.py" "$audit/rehearsal-before.json" "$audit/rehearsal-after.json"
cleanup_check
trap - EXIT
docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.Config.Image}}' "$telegram_container" > "$audit/telegram-after-prepare.txt"
cmp "$audit/telegram-before.txt" "$audit/telegram-after-prepare.txt"
test "$(readlink -f "$base/current")" = "$previous"
test "$(docker inspect --format '{{.Image}}' "$game_container")" = "$(cat "$audit/previous-image-id.txt")"
sha256sum "$audit/rehearsal-before.json" "$audit/rehearsal-after.json" "$base/test-$release.log" > "$audit/preflight.sha256"
date -u +%FT%TZ > "$audit/PREPARED"
echo "PREPARED $release; production still runs $previous."
