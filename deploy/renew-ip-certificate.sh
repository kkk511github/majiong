#!/usr/bin/env bash
set -Eeuo pipefail
instance=${MAHJONG_INSTANCE:-/opt/jinling-mahjong/server}
check_only=false
case "${1:-}" in
  '') ;;
  --check-only) check_only=true ;;
  *) echo 'Usage: renew-ip-certificate.sh [--check-only]' >&2; exit 2 ;;
esac
certificate="$instance/letsencrypt/live/mahjong-ip/fullchain.pem"
server_name=$(sed -n 's/^MAHJONG_DOMAIN=//p' "$instance/.env")
if [[ ! "$server_name" =~ ^[a-zA-Z0-9.-]+$ ]]; then
  echo 'Missing or invalid MAHJONG_DOMAIN; refusing certificate reload' >&2
  exit 1
fi
fingerprint() {
  local value
  value=$(openssl x509 "$@" -noout -fingerprint -sha256)
  value=${value#*=}; value=${value//:/}
  value=$(printf '%s' "$value" | tr '[:lower:]' '[:upper:]')
  [[ "$value" =~ ^[A-F0-9]{64}$ ]] || return 1
  printf '%s' "$value"
}
served_fingerprint() {
  local chain
  chain=$(timeout 10 openssl s_client -connect 127.0.0.1:443 -servername "$server_name" -showcerts </dev/null 2>/dev/null) || return 1
  printf '%s\n' "$chain" | fingerprint
}
if ! "$check_only"; then
  exec 9>"$instance/cert-renew.lock"
  flock -n 9 || exit 0
  # Native clients pin the public key; never rotate it during renewal.
  docker run --rm -v "$instance/letsencrypt:/etc/letsencrypt" -v "$instance/acme:/var/www/acme" certbot/certbot:v5.8.0 renew --cert-name mahjong-ip --reuse-key --quiet
fi
openssl x509 -in "$certificate" -checkend 86400 -noout
disk=$(fingerprint -in "$certificate")
if ! served=$(served_fingerprint); then
  echo 'Cannot verify the gateway certificate; refusing a blind reload' >&2
  exit 1
fi
if [[ "$disk" == "$served" ]]; then
  echo 'Gateway already serves this certificate; skipped reload (WebSockets preserved).'
  exit 0
fi
if "$check_only"; then
  echo 'Gateway certificate differs from disk; reload is needed. Check-only made no changes.'
  exit 0
fi
# A failed reload leaves the served fingerprint different, so the next check
# retries without a marker claiming success. Routine unchanged checks do not
# tear down every active WebSocket merely to refresh identical configuration.
docker compose -p jinling-mahjong --project-directory "$instance" exec -T gateway caddy reload --force --config /etc/caddy/Caddyfile
served=$(served_fingerprint)
if [[ "$disk" != "$served" ]]; then
  echo 'Gateway did not load the renewed certificate; retry on the next check' >&2
  exit 1
fi
echo 'Renewed certificate is now served by the gateway.'
