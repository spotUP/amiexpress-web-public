#!/bin/sh
# Does this door need `npm install`?
#
# Exit 0 = install, exit 1 = leave it alone.
#
# The entrypoint used to ask only whether a door's package.json mentioned
# better-sqlite3, so every OTHER door got the SDK symlink and no node_modules
# at all - node_modules is excluded from the Docker build, so nothing else
# supplied them. WHIP declares xml2js and died on the live site with "Cannot
# find module 'xml2js'" the first time somebody opened it; any door with a
# plain npm dependency was in the same state, unnoticed until run.
#
# Two reasons to install:
#   1. the door declares dependencies and has no node_modules
#   2. it uses better-sqlite3 and the compiled binary is missing - a macOS
#      build does not run on Linux, so the directory can exist and be useless
#      (the original reason this check existed)

door_dir="$1"
[ -n "$door_dir" ] || exit 1
[ -f "$door_dir/package.json" ] || exit 1

# Is any DECLARED dependency actually missing?
#
# Not "does node_modules exist": the entrypoint creates node_modules/@amiexpress
# itself for the SDK symlink, so the directory is there for every door whether
# or not anything was ever installed. On the live site whip/node_modules held
# exactly one entry - @amiexpress - while xml2js and uuid, both declared, were
# absent. A check for the directory would have called that installed and left
# the door broken.
#
# `file:` specs are skipped: the SDK is symlinked in by the entrypoint, not
# installed from a registry.
#
# fs.readFileSync, not require(): require() resolves a bare relative path like
# "Doors/whip" against node_modules and throws, which reported "no
# dependencies" for a door that had them.
missing=$(node -e '
  const fs = require("fs"), path = require("path");
  try {
    const dir = process.argv[1];
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    const deps = pkg.dependencies || {};
    const absent = Object.entries(deps)
      .filter(([, spec]) => typeof spec !== "string" || !spec.startsWith("file:"))
      .filter(([name]) => !fs.existsSync(path.join(dir, "node_modules", name)));
    process.stdout.write(absent.length > 0 ? "1" : "0");
  } catch (e) { process.stdout.write("0"); }
' "$door_dir" 2>/dev/null)

if [ "$missing" = "1" ]; then
  exit 0
fi

if grep -q '"better-sqlite3"' "$door_dir/package.json" 2>/dev/null; then
  if [ ! -f "$door_dir/node_modules/better-sqlite3/build/Release/better_sqlite3.node" ]; then
    exit 0
  fi
fi

exit 1
