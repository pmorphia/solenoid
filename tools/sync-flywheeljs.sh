#!/bin/sh
# Copies flywheel.js (github.com/fwlang/flywheel.js) into web/vendor with two small additions
# that Solenoid's web build needs:
#   - Flywheel.libraries: the table of library modules written in Flywheel, so the modules of
#     the open project can be imported;
#   - opts.onInput: called when input() has no line left (Solenoid asks for one and runs again).
# Usage: tools/sync-flywheeljs.sh [path/to/flywheel.js]
set -e
source=${1:-$HOME/projects/flywheel.js/flywheel.js}
target=$(dirname "$0")/../web/vendor/flywheel.js
sed -e 's|const api = { run, parse, Session,|const api = { libraries: FW_LIBRARIES, run, parse, Session,|' \
    -e 's|return I.stdin \&\& I.stdin.length ? I.stdin.shift() : null; });|return I.stdin \&\& I.stdin.length ? I.stdin.shift() : (I.opts \&\& I.opts.onInput ? I.opts.onInput() : null); });|' \
    "$source" > "$target"
grep -q 'libraries: FW_LIBRARIES' "$target" || { echo "flywheel.js changed: the api line was not found" >&2; exit 1; }
grep -q 'I.opts.onInput' "$target" || { echo "flywheel.js changed: the input line was not found" >&2; exit 1; }
echo "wrote $target"
