#!/usr/bin/env bash
# Run on the Linux server: publish-web.sh web.tar.gz WEB_ROOT RELEASE
# WEB_ROOT is the directory containing the existing current symlink.
set -euo pipefail
archive=${1:?Specify the web archive}
web=${2:?Specify the existing web release directory}
release=${3:?Specify a unique release name}
[[ "$release" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]*$ ]] || { echo "Invalid release name" >&2; exit 1; }
[[ -d "$web" && -L "$web/current" && -f "$archive" ]] || { echo "Existing web installation or archive not found" >&2; exit 1; }
exec 9>"$web/.publish.lock"
flock -n 9
target="$web/$release"
[[ ! -e "$target" && ! -e "$web/current.next" ]] || { echo "Release already exists" >&2; exit 1; }
mkdir "$target"
tar -xzf "$archive" -C "$target" --no-same-owner
test -f "$target/index.html"
test -f "$target/cocos-table/index.html"
test -d "$target/assets"
# An already-open page still imports its original hashed feature chunks.
# Keep those files reachable after switching releases, including older tabs.
# Never replace the new index, media or table runtime with older versions.
for previous in "$web"/*; do
  [[ -d "$previous/assets" && "$previous" != "$target" && ! -L "$previous" ]] || continue
  cp -an "$previous/assets/." "$target/assets/"
done
previous=$(readlink "$web/current")
printf '%s\n' "$previous" > "$target/previous-release.txt"
ln -s "$release" "$web/current.next"
mv -Tf "$web/current.next" "$web/current"
printf 'Web release: %s\nPrevious release (rollback): %s\n' "$release" "$previous"
