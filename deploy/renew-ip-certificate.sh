#!/usr/bin/env bash
set -Eeuo pipefail
instance=/opt/jinling-mahjong/server
exec 9>"$instance/cert-renew.lock"
flock -n 9 || exit 0
# Native clients pin the public key; renew the certificate without rotating it.
docker run --rm -v "$instance/letsencrypt:/etc/letsencrypt" -v "$instance/acme:/var/www/acme" certbot/certbot:v5.8.0 renew --cert-name mahjong-ip --reuse-key --quiet
# Reload on every successful check so a previous reload failure is retried too.
docker compose -p jinling-mahjong --project-directory "$instance" exec -T gateway caddy reload --force --config /etc/caddy/Caddyfile
openssl x509 -in "$instance/letsencrypt/live/mahjong-ip/fullchain.pem" -checkend 86400 -noout
