#!/bin/sh
# A door's node_modules live on the volume, not in the image: they are
# installed once (door installer, or by hand) and every later deploy keeps
# them. A native addon in there - better-sqlite3 in grandmaster and dopewars -
# is compiled against ONE Node ABI. When the image moved to Node 24
# (9e9b551ee, 2026-10-12) those binaries stayed Node 20 builds, and GMASTER
# failed on live with "Error relocating .../better_sqlite3.node:
# _ZN2v89Exception10RangeError...: symbol not found".
#
# So the ABI a door's addons were built for is recorded next to them, and a
# door whose record differs from the running Node is rebuilt here, at boot.
# `npm rebuild` fetches the matching prebuilt binary (about 2 s per door) and
# falls back to compiling with the image's build-base.
#
# Only the packages that hold an addon are named. A bare `npm rebuild` also
# runs the door's OWN install scripts, and grandmaster's is a tsc build that
# fails inside the image: the addon was rebuilt, the command still exited 1,
# the stamp was never written and every boot logged a false [ERROR].
#
# Usage: rebuild-door-natives.sh <doors-dir>
# NODE_ABI and NPM_BIN override the running ABI and npm, for the test only.

doors_dir="$1"
[ -d "$doors_dir" ] || { echo "[Natives] [ERROR] no doors dir: $doors_dir"; exit 0; }

abi="${NODE_ABI:-$(node -p process.versions.modules)}"
npm_bin="${NPM_BIN:-npm}"
stamp_name=".amiexpress-node-abi"

for modules in "$doors_dir"/*/node_modules; do
    [ -d "$modules" ] || continue
    door_dir="$(dirname "$modules")"
    door="$(basename "$door_dir")"

    # Only a door that ships a compiled addon depends on the ABI.
    # The package that holds each addon: the path after the LAST node_modules/
    # up to /build/, so a nested or scoped (@scope/name) package names itself.
    packages="$(find "$modules" -name '*.node' -path '*/build/*' 2>/dev/null \
        | sed -e 's#.*/node_modules/##' -e 's#/build/.*##' | sort -u)"
    [ -n "$packages" ] || continue

    stamp="$modules/$stamp_name"
    if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$abi" ]; then
        continue
    fi

    echo "[Natives] Doors/$door: rebuilding native addons for Node ABI $abi"
    if (cd "$door_dir" && "$npm_bin" rebuild $packages --no-audit --no-fund >/dev/null 2>&1); then
        echo "$abi" > "$stamp"
        echo "[Natives] [OK] Doors/$door"
    else
        echo "[Natives] [ERROR] Doors/$door: npm rebuild failed; the door will not load its addon"
    fi
done
exit 0
