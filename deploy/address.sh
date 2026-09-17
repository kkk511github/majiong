#!/usr/bin/env bash
# Public IPv4 or DNS name only; also prevents interpolation into shell/config syntax.
valid_public_ipv4() {
  local value=$1 octet a b c d
  [[ $value =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  IFS=. read -r a b c d <<< "$value"
  for octet in "$a" "$b" "$c" "$d"; do
    [[ $octet =~ ^(0|[1-9][0-9]{0,2})$ ]] && ((octet <= 255)) || return 1
  done
  ((a > 0 && a < 224 && a != 10 && a != 127)) || return 1
  ((!(a == 100 && b >= 64 && b <= 127))) || return 1
  ((!(a == 169 && b == 254) && !(a == 172 && b >= 16 && b <= 31))) || return 1
  ((!(a == 192 && (b == 168 || (b == 0 && (c == 0 || c == 2)))))) || return 1
  ((!(a == 198 && (b == 18 || b == 19 || (b == 51 && c == 100))))) || return 1
  ((!(a == 203 && b == 0 && c == 113)))
}
valid_domain() {
  local label value=$1
  [[ ${#value} -le 253 && $value == *.* && $value != *..* && $value =~ \.[a-zA-Z]{2,}$ ]] || return 1
  local labels
  IFS=. read -ra labels <<< "$value"
  for label in "${labels[@]}"; do
    [[ ${#label} -le 63 && $label =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$ ]] || return 1
  done
}
valid_server_address() { valid_public_ipv4 "$1" || valid_domain "$1"; }
