#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
tools_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source_dir=$(cd -- "$tools_dir/.." && pwd)
# shellcheck source=deploy/address.sh
source "$tools_dir/address.sh"
# shellcheck source=deploy/report-dates.sh
source "$tools_dir/report-dates.sh"
answer='' admin_password='' repeat_password=''
ask() {
  printf '%s' "$1"
  if ! IFS= read -r answer; then echo; echo '输入结束，已退出。'; exit 0; fi
}
choose() {
  local prompt=$1 valid=$2 default=$3
  while true; do
    ask "$prompt"
    answer=${answer:-$default}
    [[ $answer =~ $valid ]] && return 0
    echo '选项无效，请重新输入。'
  done
}
secret() {
  printf '%s' "$1"
  if ! IFS= read -rs answer; then echo; echo '输入结束，已退出。'; exit 0; fi
  echo
}
die() { echo "错误：$*" >&2; exit 1; }

if [[ ${1:-} == --help ]]; then
  echo '在新服务器的项目或安装包目录执行：bash deploy/install.sh'
  echo '交互式全新安装；不迁移旧数据。选择“仅检查”不会安装软件、联网或写入配置。'
  exit 0
fi
[[ $# == 0 ]] || die '无需参数，请直接运行 bash deploy/install.sh'
echo '金陵麻将 · 新服务器安装向导'
echo '新系统从空数据库开始，不复制旧账号、成员、积分或牌局。'
echo
echo '第一步：选择操作'
echo '  1. 全新安装到当前服务器'
echo '  2. 仅检查环境和填写部署计划'
echo '  0. 退出'
choose '请选择 [1]：' '^[012]$' 1
mode=$answer
[[ $mode != 0 ]] || exit 0
if [[ $mode == 1 ]]; then
  [[ $(uname -s) == Linux && $(id -u) == 0 ]] || die '请在新服务器以 root 登录后运行；可选 2 仅查看计划'
  [[ -f /etc/os-release ]] || die '未找到系统信息'
  # shellcheck source=/dev/null
  source /etc/os-release
  [[ $ID == ubuntu || $ID == debian ]] || die '支持 Ubuntu / Debian 服务器'
  [[ ! -e /opt/jinling-mahjong/current && ! -e /opt/jinling-mahjong/server ]] || die '检测到已有安装，新机向导不会覆盖它'
fi
echo
echo '第二步：HTTPS 地址'
echo '  1. 没有域名，使用公网 IPv4 地址'
echo '  2. 使用域名'
choose '请选择 [1]：' '^[12]$' 1
address_mode=$answer
echo '需要放行 TCP 80、443，IP 证书会每六小时检查自动续期。'
while true; do
  if [[ $address_mode == 1 ]]; then
    ask '请输入这台服务器的固定公网 IPv4（不带 https://）：'
  else
    ask '请输入已解析到这台服务器的域名（不带 https://）：'
  fi
  domain=$answer
  if [[ $address_mode == 1 ]]; then
    valid_public_ipv4 "$domain" && break
    echo '请输入有效的公网 IPv4，不能使用内网、回环或保留地址。'
  else
    valid_domain "$domain" && break
    echo '请输入有效域名。'
  fi
done
echo '邮箱只用于 HTTPS 证书申请的联系信息，不是 Telegram 邮箱，也不会收取报表。'
echo '证书由服务器自动续期，不依赖邮件提醒。'
while true; do
  ask '请输入证书联系邮箱：'
  email=$answer
  [[ $email =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] && break
  echo '邮箱格式不正确，请重填。'
done
echo
echo '第三步：沿用 Telegram 配置'
echo '  1. 使用项目目录内现有 Telegram 私密配置（不连接旧服务器）'
echo '  2. 使用已经上传到本机的配置文件和 token 文件'
echo '  3. 暂不配置 Telegram'
while true; do
  choose '请选择 [1]：' '^[123]$' 1
  telegram_mode=$answer
  [[ $telegram_mode != 1 || -s $source_dir/telegram-config.tar.gz ]] && break
  echo '项目目录缺少 telegram-config.tar.gz，请放入私密配置文件，或选择 2 / 3。'
done
config_file='' token_file='' start_telegram=0 daily_start='' weekly_start=''
if [[ $telegram_mode == 2 ]]; then
  while true; do
    ask 'report-config.json 的绝对路径：'
    config_file=$answer
    [[ $config_file == /* && -r $config_file && -s $config_file ]] && break
    echo '文件不存在、为空或不可读。'
  done
  while true; do
    ask 'telegram-bot-token 的绝对路径（不要在这里粘贴 token）：'
    token_file=$answer
    [[ $token_file == /* && -r $token_file && -s $token_file ]] && break
    echo '文件不存在、为空或不可读。'
  done
fi
if [[ $telegram_mode != 3 ]]; then
  echo '统计日期均为北京时间 00:00；日结每1天、周结每7天发送一次。'
  while true; do
    ask '日结统计起点 YYYYMMDD（例如 20260918）：'
    daily_start=$answer
    valid_report_date "$daily_start" && break
    echo '日期无效，请按 YYYYMMDD 输入真实日期。'
  done
  while true; do
    ask "周结统计起点 YYYYMMDD [${daily_start}]："
    weekly_start=${answer:-$daily_start}
    valid_report_date "$weekly_start" && break
    echo '日期无效，请重新输入。'
  done
  echo "首次日结：$(report_first_end "$daily_start" 1) 00:00；首次周结：$(report_first_end "$weekly_start" 7) 00:00。"
  echo '若起点已过去，启用后会补发从该起点开始的到期报表，新库没有的旧数据不会恢复。'
  echo '  1. 先配置和验证，不启动定时发送'
  echo '  2. 安装后启动定时发送（确认旧服已停用统计，避免两边同时发群）'
  choose '定时统计选择 [1]：' '^[12]$' 1
  [[ $answer != 2 ]] || start_telegram=1
fi
echo
echo '第四步：管理员密码'
echo '管理员账号：guanli@1；首次登录需要修改密码。'
echo '  1. 自动生成，保存在本机 root 专用文件'
echo '  2. 自己设置（输入不会回显）'
choose '请选择 [1]：' '^[12]$' 1
password_mode=$answer
if [[ $password_mode == 2 ]]; then
  while true; do
    secret '请输入初始密码（12-128 位，首尾不能是空白）：'
    admin_password=$answer
    if [[ ${#admin_password} -lt 12 || ${#admin_password} -gt 128 || $admin_password == [[:space:]]* || $admin_password == *[[:space:]] ]]; then
      echo '密码长度或首尾空白不符合要求。'; continue
    fi
    secret '请再次输入密码：'
    repeat_password=$answer
    [[ $admin_password == "$repeat_password" ]] && break
    echo '两次密码不一致，请重新设置。'
  done
fi
answer='' repeat_password=''
echo
echo '第五步：核对配置'
printf '安装位置：当前服务器 /opt/jinling-mahjong\n游戏地址：https://%s/mahjong\n证书邮箱：%s\n' "$domain" "$email"
echo '数据库：全新空库'
case $telegram_mode in
  1) echo 'Telegram：直接使用安装包内现有配置，不连接旧服务器';;
  2) echo "Telegram：使用本机配置文件 $config_file";;
  3) echo 'Telegram：暂不配置';;
esac
if [[ $telegram_mode != 3 ]]; then
  echo "日结起点：${daily_start} 00:00；首次发送：$(report_first_end "$daily_start" 1) 00:00（北京时间）"
  echo "周结起点：${weekly_start} 00:00；首次发送：$(report_first_end "$weekly_start" 7) 00:00（北京时间）"
fi
if ((start_telegram)); then echo '定时统计：安装后启用'; else echo '定时统计：暂不启用'; fi
if [[ $password_mode == 1 ]]; then echo '管理员密码：自动生成'; else echo '管理员密码：已设置（不显示）'; fi
if [[ $mode == 2 ]]; then
  echo "环境：$(uname -s)；当前用户：$(id -un)"
  for tool in git tar docker ss flock; do
    if command -v "$tool" >/dev/null; then echo "${tool}：已安装"; else echo "${tool}：未安装"; fi
  done
  echo '仅检查结束，未联网、未安装软件、未写入配置。'
  exit 0
fi
choose '确认开始安装？输入 y 开始，其他选项 n 取消 [n]：' '^[yYnN]$' n
[[ $answer == y || $answer == Y ]] || { echo '已取消，未安装或修改服务。'; exit 0; }
echo '开始准备安装文件。'
for tool in tar sha256sum; do command -v "$tool" >/dev/null || die "缺少 $tool"; done
if [[ -f $source_dir/source.tar.gz && -f $source_dir/SOURCE_COMMIT && -f $source_dir/SHA256SUMS ]]; then
  (cd "$source_dir" && sha256sum -c SHA256SUMS) || die '安装包校验失败'
  commit=$(<"$source_dir/SOURCE_COMMIT")
  bundled=1
else
  command -v git >/dev/null || die '请先下载完整安装包，或安装 Git 并取得项目源码'
  commit=$(git -C "$source_dir" rev-parse HEAD)
  git -C "$source_dir" diff --quiet HEAD -- || die '源码有未提交修改，请提交后重新运行'
  bundled=0
fi
[[ $commit =~ ^[a-f0-9]{40}$ ]] || die '源码版本标识无效'
staging="/opt/jinling-mahjong-incoming/$(date -u +%Y%m%dT%H%M%SZ)-${commit:0:12}"
mkdir -p "$staging/tools"
if ((bundled)); then cp "$source_dir/source.tar.gz" "$staging/source.tar.gz";
else git -C "$source_dir" archive --format=tar.gz -o "$staging/source.tar.gz" "$commit"; fi
cp "$tools_dir/bootstrap-server.sh" "$tools_dir/compose.server.yaml" "$tools_dir"/Caddyfile* "$tools_dir/fresh-telegram.mjs" "$tools_dir/address.sh" "$tools_dir/mahjong.routes" "$tools_dir/renew-ip-certificate.sh" "$tools_dir"/mahjong-ip-renew.* "$source_dir/compose.telegram.yaml" "$staging/tools/"
if [[ $telegram_mode == 1 ]]; then
  cp "$source_dir/telegram-config.tar.gz" "$staging/telegram-config.tar.gz"
elif [[ $telegram_mode == 2 ]]; then
  mkdir "$staging/telegram-input"
  cp "$config_file" "$staging/telegram-input/report-config.json"
  cp "$token_file" "$staging/telegram-input/telegram-bot-token"
  tar -czf "$staging/telegram-config.tar.gz" -C "$staging/telegram-input" report-config.json telegram-bot-token
fi
if [[ $telegram_mode != 3 ]]; then printf '%s\n%s\n' "$daily_start" "$weekly_start" > "$staging/report-starts"; fi
if [[ $password_mode == 2 ]]; then printf '%s\n' "$admin_password" > "$staging/admin-password"; fi
unset admin_password
bash "$staging/tools/bootstrap-server.sh" "$staging" "$domain" "$email" "$commit" "$start_telegram"
