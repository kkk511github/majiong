#!/usr/bin/env bash
# GNU date on the server, BSD date on the development Mac; all periods use Beijing time.
report_date_epoch() {
  local compact=$1 iso
  [[ $compact =~ ^[0-9]{8}$ && ${compact:0:4} -ge 2000 && ${compact:0:4} -le 9999 ]] || return 1
  iso="${compact:0:4}-${compact:4:2}-${compact:6:2}"
  if [[ $(uname -s) == Darwin ]]; then
    TZ=Asia/Shanghai date -j -f '%Y-%m-%d %H:%M:%S' "$iso 00:00:00" +%s 2>/dev/null
  else
    TZ=Asia/Shanghai date -d "$iso 00:00:00" +%s 2>/dev/null
  fi
}
report_date_format() {
  if [[ $(uname -s) == Darwin ]]; then TZ=Asia/Shanghai date -r "$1" +%Y%m%d;
  else TZ=Asia/Shanghai date -d "@$1" +%Y%m%d; fi
}
valid_report_date() {
  local epoch
  epoch=$(report_date_epoch "$1") || return 1
  [[ $(report_date_format "$epoch") == "$1" ]]
}
report_first_end() {
  local epoch
  epoch=$(report_date_epoch "$1") || return 1
  report_date_format "$((epoch + $2 * 86400))"
}
