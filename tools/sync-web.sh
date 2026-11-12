#!/bin/sh
# Copies the editor (web/) into a checkout of the site, github.com/pmorphia/webnoid, which
# GitHub Pages serves at solenoid.polymorphia.dev.
# Usage: tools/sync-web.sh [path/to/webnoid]    (default: ../pmiaweb/solenoid)
set -e
here=$(cd "$(dirname "$0")/.." && pwd)
site=${1:-$here/../pmiaweb/solenoid}
mkdir -p "$site"
for entry in index.html logo.png solenoid.cw css js vendor; do
    rm -rf "$site/$entry"
    cp -r "$here/web/$entry" "$site/$entry"
done
echo "copied web/ to $site"
