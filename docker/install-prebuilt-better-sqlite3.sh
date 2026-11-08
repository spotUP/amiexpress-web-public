#!/bin/sh
# Installs the backend's better-sqlite3 addon from its PREBUILT release binary,
# and fails the image build when that binary cannot be had.
#
# `npm rebuild better-sqlite3` runs the package's install script,
# `prebuild-install || node-gyp rebuild --release`: when the GitHub download
# fails it silently compiles the addon with the image's build-base instead.
# On 2026-11-08 the 11:04 UTC build did exactly that (the rebuild step took
# 88 s instead of 2 s, and build/Release/ held obj.target/ and sqlite3.a). The
# compiled better_sqlite3.node aborted the backend about three minutes into
# boot with
#     node::RemoveEnvironmentCleanupHook ... hooks.cc:142
#     Assertion failed: (env) != nullptr
# so /health never answered and every deploy of 4e9fc36ff and b8ba2462c failed
# its boot smoke for 45 minutes, because docker cached the bad layer and every
# retry reused it. The same image with only the prebuilt binary mounted over
# the compiled one answered /health in 30 s.
#
# So: no compile fallback. The download is retried; when it still fails the
# RUN fails, docker caches nothing, and the next watch-main tick builds again.
#
# Usage: install-prebuilt-better-sqlite3.sh <backend-dir>
# PREBUILD_BIN, PREBUILD_TRIES and PREBUILD_RETRY_DELAY override the
# downloader, attempts and wait between them, for the test only.

backend_dir="$1"
pkg="$backend_dir/node_modules/better-sqlite3"
[ -f "$pkg/package.json" ] || { echo "[better-sqlite3] [ERROR] not installed: $pkg"; exit 1; }

prebuild_bin="${PREBUILD_BIN:-$backend_dir/node_modules/.bin/prebuild-install}"
tries="${PREBUILD_TRIES:-5}"
delay="${PREBUILD_RETRY_DELAY:-10}"
release="$pkg/build/Release"

# Nothing left from an earlier build may stand in for the download.
rm -rf "$pkg/build"

attempt=1
while :; do
    if (cd "$pkg" && "$prebuild_bin"); then
        break
    fi
    if [ "$attempt" -ge "$tries" ]; then
        echo "[better-sqlite3] [ERROR] prebuilt binary download failed $tries times; refusing to compile it from source"
        exit 1
    fi
    echo "[better-sqlite3] download attempt $attempt failed, retrying in ${delay}s"
    attempt=$((attempt + 1))
    sleep "$delay"
done

if [ ! -f "$release/better_sqlite3.node" ]; then
    echo "[better-sqlite3] [ERROR] prebuild-install succeeded but $release/better_sqlite3.node is missing"
    exit 1
fi
if [ -d "$release/obj.target" ]; then
    echo "[better-sqlite3] [ERROR] $release holds a compiled build (obj.target), not the prebuilt binary"
    exit 1
fi
echo "[better-sqlite3] [OK] prebuilt binary installed"
exit 0
