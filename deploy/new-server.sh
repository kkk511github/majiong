#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
tools_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=deploy/address.sh
source "$tools_dir/address.sh"
if [[ $# == 0 ]]; then
  exec bash "$(dirname -- "${BASH_SOURCE[0]}")/install.sh"
fi
usage() {
  cat <<'HELP'
Install an EMPTY Mahjong system on a NEW Ubuntu/Debian server.
Usage: bash deploy/new-server.sh --host root@SERVER --domain game.example.com --email admin@example.com [--telegram-from 212-majiong] [--start-telegram] [--plan]
For a public IPv4 address, use --ip PUBLIC_IPV4 instead of --domain.
Requires: local git/tar/ssh/scp; remote root SSH, public DNS and TCP 80/443.
Copies ONLY the existing Telegram bot token and reporting configuration.
No old accounts, members, balances, game records or delivery state are imported.
--telegram-from defaults to 212-majiong; the source server is only read.
--start-telegram enables scheduled reporting (ensure the old worker is stopped).
By default Telegram is configured but not started, avoiding parallel group reports.
--plan validates arguments and prints the plan without network access.
HELP
}
die() { echo "ERROR: $*" >&2; exit 1; }
host='' domain='' email='' telegram_from=212-majiong start_telegram=0 plan=0
while (($#)); do
  case "$1" in
    --host|--domain|--ip|--email|--telegram-from)
      (($# >= 2)) || die "Missing value for $1"
      case "$1" in
        --host) host=$2;; --domain|--ip) domain=$2;; --email) email=$2;; --telegram-from) telegram_from=$2;;
      esac
      shift 2;;
    --start-telegram) start_telegram=1; shift;;
    --plan) plan=1; shift;;
    -h|--help) usage; exit 0;;
    *) die "Unknown option: $1";;
  esac
done
[[ $host =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.@-]*$ ]] || die 'Specify --host (root@hostname, IPv4, or SSH alias)'
[[ $telegram_from =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.@-]*$ ]] || die 'Invalid --telegram-from host'
[[ $host != "$telegram_from" ]] || die 'Target and existing server must differ'
valid_server_address "$domain" || die 'Specify a DNS domain or valid public IPv4, not a private/reserved IP or URL'
[[ $email =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] || die 'Specify --email for HTTPS certificate registration'
echo "Target: $host; HTTPS: https://$domain/mahjong; source: committed HEAD"
echo "Create an empty database and administrator; reuse Telegram configuration from $telegram_from."
echo "Telegram scheduled reporting enabled: $start_telegram"
((plan)) && exit 0
for command in git tar ssh scp; do command -v "$command" >/dev/null || die "Missing $command"; done
tools_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo=$(git -C "$tools_dir" rev-parse --show-toplevel)
commit=$(git -C "$repo" rev-parse HEAD)
git -C "$repo" diff --quiet HEAD -- || die 'Commit tracked changes before deploying; application source uses HEAD'
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
release="$(date -u +%Y%m%dT%H%M%SZ)-${commit:0:12}"
remote="/opt/jinling-mahjong-incoming/$release"
ssh_opts=(-o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
# Stream credentials straight into a private temporary archive; never print them.
ssh "${ssh_opts[@]}" "$telegram_from" 'docker exec jinling-mahjong-reports-telegram-reports-1 tar -czf - -C /run report-config.json -C /run/secrets telegram-bot-token' > "$work/telegram-config.tar.gz"
# Local validated arguments are intentionally expanded into the remote command.
# shellcheck disable=SC2029
ssh "${ssh_opts[@]}" "$host" "test \"\$(id -u)\" = 0 && mkdir -p '$remote/tools' && chmod 700 '$remote'"
git -C "$repo" archive --format=tar.gz -o "$work/source.tar.gz" "$commit"
scp "${ssh_opts[@]}" "$work/source.tar.gz" "$work/telegram-config.tar.gz" "$host:$remote/"
scp "${ssh_opts[@]}" "$tools_dir/bootstrap-server.sh" "$tools_dir/compose.server.yaml" "$tools_dir"/Caddyfile* "$tools_dir/fresh-telegram.mjs" "$tools_dir/address.sh" "$tools_dir/mahjong.routes" "$tools_dir/renew-ip-certificate.sh" "$tools_dir"/mahjong-ip-renew.* "$repo/compose.telegram.yaml" "$host:$remote/tools/"
# shellcheck disable=SC2029
ssh "${ssh_opts[@]}" "$host" "bash '$remote/tools/bootstrap-server.sh' '$remote' '$domain' '$email' '$commit' '$start_telegram'"
