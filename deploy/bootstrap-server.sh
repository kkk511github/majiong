#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
tools_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=deploy/address.sh
source "$tools_dir/address.sh"
die() { echo "ERROR: $*" >&2; exit 1; }
[[ $# == 5 ]] || die 'Called by deploy/new-server.sh: STAGING DOMAIN EMAIL COMMIT START_TELEGRAM'
staging=$1 domain=$2 email=$3 commit=$4 start_telegram=$5
[[ $start_telegram == 0 || $start_telegram == 1 ]] || die 'Invalid Telegram startup mode'
[[ $staging =~ ^/opt/jinling-mahjong-incoming/[0-9TZ-]+-[a-f0-9]{12}$ ]] || die 'Invalid staging path'
valid_server_address "$domain" || die 'Invalid domain or public IPv4'
ip_mode=0
if valid_public_ipv4 "$domain"; then ip_mode=1; fi
[[ $email =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] || die 'Invalid email'
[[ $commit =~ ^[a-f0-9]{40}$ ]] || die 'Invalid commit'
[[ $(id -u) == 0 && $(uname -s) == Linux ]] || die 'Requires root on Ubuntu or Debian'
# shellcheck source=/dev/null
source /etc/os-release
[[ $ID == ubuntu || $ID == debian ]] || die 'Supported systems: Ubuntu and Debian'
[[ -n ${VERSION_CODENAME:-} ]] || die 'Missing OS codename'
root=/opt/jinling-mahjong
release=${staging##*/}
image="jinling-mahjong:$release"
source_dir="$root/releases/$release"
instance="$root/server"
command -v ss >/dev/null || die 'Install iproute2 before deployment'
command -v flock >/dev/null || die 'Install util-linux before deployment'
mkdir -p "$root"
exec 9>"$root/deploy.lock"
flock -n 9 || die 'Another deployment is running'
[[ ! -e $root/current && ! -e $instance ]] || die 'Existing Mahjong installation found; this script is only for a new server'
if command -v docker >/dev/null; then
  docker info >/dev/null 2>&1 || die 'Existing Docker daemon is unavailable; start it before deployment so existing data can be checked'
  [[ -z $(docker ps -aq --filter label=com.docker.compose.project=jinling-mahjong) ]] || die 'Existing Mahjong containers found'
  ! docker volume inspect jinling-mahjong_mahjong-data >/dev/null 2>&1 || die 'Existing Mahjong data volume found; refusing to overwrite'
  [[ -z $(docker ps -aq --filter label=com.docker.compose.project=jinling-mahjong-reports) ]] || die 'Existing Telegram worker found'
  ! docker volume inspect jinling-mahjong-reports_telegram-report-state >/dev/null 2>&1 || die 'Existing Telegram state found'
fi
[[ -z $(ss -H -ltn '( sport = :80 or sport = :443 )') ]] || die 'Ports 80/443 are in use; configure this host manually'
test -f "$staging/source.tar.gz"
if ((start_telegram)); then test -s "$staging/telegram-config.tar.gz"; fi
echo '正在安装系统依赖和 Docker...'
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg openssl
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl --fail --silent --show-error --location "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  chmod 644 /etc/apt/keyrings/docker.asc
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' "$(dpkg --print-architecture)" "$ID" "$VERSION_CODENAME" > /etc/apt/sources.list.d/mahjong-docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
docker compose version >/dev/null || die 'Docker Compose v2 is required; install its plugin and retry'
systemctl enable --now docker
mkdir -p "$source_dir"
tar -xzf "$staging/source.tar.gz" -C "$source_dir"
printf '%s\n' "$commit" > "$source_dir/DEPLOYED_COMMIT"
echo "正在构建游戏镜像，日志：$root/build-$release.log"
if ! docker build --label "org.opencontainers.image.revision=$commit" -t "$image" "$source_dir" >"$root/build-$release.log" 2>&1; then
  tail -40 "$root/build-$release.log"
  die '镜像构建失败，请检查上述日志后重试'
fi
echo "镜像构建完成，正在运行测试。日志：$root/test-$release.log"
if ! docker run --rm "$image" npm test >"$root/test-$release.log" 2>&1; then
  tail -40 "$root/test-$release.log"
  die '测试未通过，尚未启动游戏服务'
fi
docker pull caddy:2.10-alpine
docker run --rm -e "MAHJONG_DOMAIN=$domain" -e "ACME_EMAIL=$email" -v "$staging/tools/Caddyfile:/etc/caddy/Caddyfile:ro" -v "$staging/tools/mahjong.routes:/etc/caddy/mahjong.routes:ro" caddy:2.10-alpine caddy adapt --validate --config /etc/caddy/Caddyfile >/dev/null
mkdir -p "$instance"
cp "$staging/tools/compose.server.yaml" "$instance/compose.yaml"
cp "$staging/tools/Caddyfile" "$instance/Caddyfile"
cp "$staging/tools/mahjong.routes" "$instance/mahjong.routes"
mkdir -p "$instance/acme" "$instance/letsencrypt"
chmod 755 "$instance/acme"
chmod 644 "$instance/Caddyfile" "$instance/mahjong.routes"
printf 'MAHJONG_RELEASE=%s\nMAHJONG_DOMAIN=%s\nACME_EMAIL=%s\n' "$release" "$domain" "$email" > "$instance/.env"
compose=(docker compose --project-name jinling-mahjong --project-directory "$instance" -f "$instance/compose.yaml")
started=0
failed() {
  status=$?
  trap - EXIT
  if ((status != 0)); then
    if ((ip_mode)); then systemctl disable --now mahjong-ip-renew.timer >/dev/null 2>&1 || true; fi
    if [[ -f $root/telegram-reports/compose.yaml ]]; then
      docker compose -p jinling-mahjong-reports --project-directory "$root/telegram-reports" -f "$root/telegram-reports/compose.yaml" stop || true
    fi
    if ((started)); then "${compose[@]}" stop gateway mahjong || true; fi
    echo "Setup failed. Data and logs retained at $root; no existing server was changed." >&2
    echo "Resolve the error before restarting this installation; do not delete its data volume." >&2
  fi
  exit "$status"
}
trap failed EXIT
docker volume create jinling-mahjong_mahjong-data >/dev/null
docker run --rm --user 0 -v jinling-mahjong_mahjong-data:/app/data "$image" chown 1000:1000 /app/data
started=1
"${compose[@]}" up -d --no-deps --wait --wait-timeout 120 mahjong
admin_exists=$("${compose[@]}" exec -T mahjong node --input-type=module -e 'import {DatabaseSync} from "node:sqlite"; const db=new DatabaseSync(process.env.DATABASE_PATH,{readOnly:true}); console.log(db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE role=?").get("admin").n); db.close();')
if [[ $admin_exists == 0 ]]; then
  if [[ -s $staging/admin-password ]]; then
    install -m 600 "$staging/admin-password" "$root/initial-admin-password"
    rm "$staging/admin-password"
  else
    openssl rand -base64 24 > "$root/initial-admin-password"
  fi
  "${compose[@]}" exec -T mahjong node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>process.stdout.write(JSON.stringify({password:s.trim()})))' < "$root/initial-admin-password" | "${compose[@]}" exec -T mahjong node --import tsx scripts/admin-account.ts
  echo "Initial administrator: guanli@1. Password saved in $root/initial-admin-password (root only)."
else
  echo 'Existing administrator accounts retained.'
fi
if ((ip_mode)); then
  echo '正在申请公网 IP 的 HTTPS 证书，请确保此 IP 属于本机，80/443 端口已放行...'
  cp "$staging/tools/Caddyfile.ip-http" "$instance/Caddyfile"
  "${compose[@]}" up -d gateway
  docker run --rm -v "$instance/letsencrypt:/etc/letsencrypt" -v "$instance/acme:/var/www/acme" certbot/certbot:v5.8.0 certonly --non-interactive --agree-tos --email "$email" --cert-name mahjong-ip --preferred-profile shortlived --webroot --webroot-path /var/www/acme --ip-address "$domain"
  cp "$staging/tools/Caddyfile.ip" "$instance/Caddyfile"
  "${compose[@]}" exec -T gateway caddy reload --config /etc/caddy/Caddyfile
  install -m 700 "$staging/tools/renew-ip-certificate.sh" "$instance/renew-ip-certificate.sh"
  install -m 644 "$staging/tools/mahjong-ip-renew.service" "$staging/tools/mahjong-ip-renew.timer" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now mahjong-ip-renew.timer
else
  "${compose[@]}" up -d gateway
  echo '正在申请 HTTPS 证书，请确保域名解析正确、80/443 端口已放行...'
fi
ready=0
for attempt in $(seq 1 30); do
  echo "HTTPS readiness check $attempt/30"
  if curl -fsS --resolve "$domain:443:127.0.0.1" --connect-timeout 5 --max-time 8 "https://$domain/mahjong/api/health" >"$root/public-health.json"; then ready=1; break; fi
  sleep 5
done
((ready)) || die 'Public HTTPS did not become ready; inspect gateway logs, address and firewall rules'
"${compose[@]}" exec -T mahjong npm run check:deployment -- "https://$domain/mahjong" >"$root/public-check.json"
if [[ -f $staging/telegram-config.tar.gz ]]; then
  reports="$root/telegram-reports"
  mkdir -p "$reports/import"
  tar -xzf "$staging/telegram-config.tar.gz" -C "$reports/import"
  test -f "$reports/import/report-config.json"
  test -s "$reports/import/telegram-bot-token"
  report_starts=()
  if [[ -f $staging/report-starts ]]; then
    mapfile -t report_starts < "$staging/report-starts"
    [[ ${#report_starts[@]} == 2 ]] || die 'Invalid report start dates'
  fi
  docker run --rm --user 0 -v jinling-mahjong_mahjong-data:/app/data -v "$reports:/setup" -v "$staging/tools/fresh-telegram.mjs:/app/deploy/fresh-telegram.mjs:ro" -e DATABASE_PATH=/app/data/mahjong.sqlite "$image" node --import tsx /app/deploy/fresh-telegram.mjs /setup/import/report-config.json /setup/report-config.json "${report_starts[@]}"
  cp "$reports/import/telegram-bot-token" "$reports/telegram-bot-token"
  chown 1000:1000 "$reports/report-config.json" "$reports/telegram-bot-token"
  chmod 400 "$reports/report-config.json" "$reports/telegram-bot-token"
  cp "$staging/tools/compose.telegram.yaml" "$reports/compose.yaml"
  printf 'TELEGRAM_REPORT_IMAGE=%s\nTELEGRAM_REPORT_CONFIG_FILE=%s/report-config.json\nTELEGRAM_REPORT_TOKEN_FILE=%s/telegram-bot-token\n' "$image" "$reports" "$reports" > "$reports/.env"
  docker volume create jinling-mahjong-reports_telegram-report-state >/dev/null
  docker run --rm --user 0 -v jinling-mahjong-reports_telegram-report-state:/reports "$image" chown 1000:1000 /reports
  # Verify the destination without sending a report.
  docker compose -p jinling-mahjong-reports --project-directory "$reports" -f "$reports/compose.yaml" run --rm --no-deps telegram-reports node --import tsx server/telegram-report-worker.ts check > "$root/telegram-check.json"
  if ((start_telegram)); then
    docker compose -p jinling-mahjong-reports --project-directory "$reports" -f "$reports/compose.yaml" up -d --no-build --wait --wait-timeout 120
  fi
  echo "Existing Telegram configuration reused with EMPTY delivery state. Reporting enabled: $start_telegram"
fi
ln -s "$source_dir" "$root/current"
echo "Deployment complete: https://$domain/mahjong"
echo "Service configuration: $instance; source commit: $commit"
echo '安装完成。管理员：guanli@1；初始密码文件：/opt/jinling-mahjong/initial-admin-password'
