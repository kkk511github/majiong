#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ $# == 1 || ( $# == 3 && $2 == --telegram-from ) ]] || { echo 'Usage: bash deploy/package-installer.sh /absolute/path/mahjong-installer.tar.gz [--telegram-from SSH_HOST]' >&2; exit 1; }
telegram_from=${3:-}
[[ -z $telegram_from || $telegram_from =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.@-]*$ ]] || { echo 'Invalid Telegram source host' >&2; exit 1; }
output=$1
[[ $output == /* && ! -e $output ]] || { echo 'Choose an absolute, unused output path' >&2; exit 1; }
tools_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo=$(git -C "$tools_dir" rev-parse --show-toplevel)
commit=$(git -C "$repo" rev-parse HEAD)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/mahjong-installer/deploy"
bundle="$work/mahjong-installer"
# The app is the committed release; installer tools are included from this checkout.
git -C "$repo" archive --format=tar.gz -o "$bundle/source.tar.gz" "$commit"
printf '%s\n' "$commit" > "$bundle/SOURCE_COMMIT"
cp "$tools_dir/install.sh" "$tools_dir/bootstrap-server.sh" "$tools_dir/compose.server.yaml" "$tools_dir"/Caddyfile* "$tools_dir/fresh-telegram.mjs" "$tools_dir/address.sh" "$tools_dir/report-dates.sh" "$tools_dir/mahjong.routes" "$tools_dir/renew-ip-certificate.sh" "$tools_dir"/mahjong-ip-renew.* "$bundle/deploy/"
cp "$repo/compose.telegram.yaml" "$bundle/"
cp "$repo/docs/NEW-SERVER.md" "$bundle/README.md"
(cd "$bundle" && shasum -a 256 source.tar.gz SOURCE_COMMIT compose.telegram.yaml deploy/* > SHA256SUMS)
if [[ -n $telegram_from ]]; then
  ssh -o BatchMode=yes -o ConnectTimeout=15 "$telegram_from" 'docker exec jinling-mahjong-reports-telegram-reports-1 tar -czf - -C /run report-config.json -C /run/secrets telegram-bot-token' > "$bundle/telegram-config.tar.gz"
  test -s "$bundle/telegram-config.tar.gz"
  (cd "$bundle" && shasum -a 256 telegram-config.tar.gz >> SHA256SUMS)
fi
COPYFILE_DISABLE=1 tar -czf "$output" -C "$work" mahjong-installer
echo "Installer: $output"
echo "Application commit: $commit"
if [[ -n $telegram_from ]]; then
  echo 'Private installer includes the current Telegram credentials/config ONLY; do not distribute publicly.'
else
  echo 'No Telegram credentials are included.'
fi
echo 'No business databases or delivery history are included.'
