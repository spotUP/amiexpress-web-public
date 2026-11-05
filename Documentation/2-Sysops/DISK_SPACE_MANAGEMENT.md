# Disk Space Management

## Overview

This document explains disk space issues that can occur in the AmiExpress-Web project and how to prevent them.

## Common Issues

### 1. Door node_modules Bloat (6+ GB)

**Problem:** Doors using `file:` dependencies copy the entire SDK directory into their `node_modules`, including:
- SDK examples (229MB with their own node_modules)
- SDK preview tools (224MB with full frontend)
- Test files and fixtures
- Nested duplicates creating exponential growth

**Example of problematic package.json:**
```json
{
  "dependencies": {
    "@amiexpress/bbs-door-sdk": "file:../../sdk"
  }
}
```

This causes npm to copy 600MB+ of SDK files into each door's node_modules, with nested dependencies creating multi-GB duplication.

**Prevention:**

1. SDK now has `.npmignore` excluding examples/tools/tests
2. SDK package.json has "files" field limiting to dist/ only
3. Run periodic cleanup: `./dev/scripts/clean-door-dependencies.sh`
4. Doors in `Doors/` should NOT have node_modules committed to git

**Solution for existing doors:**
```bash
# Clean all door dependencies
./dev/scripts/clean-door-dependencies.sh

# Doors will still work because they reference SDK via file: link
# The SDK is built at sdk/dist/ and doors load from there
```

### 2. Unbounded Log Growth (100+ MB)

**Problem:** Log files grow without rotation:
- `logs/door-68k.log` - 96MB (all 68K door execution traces)
- `Node1/CLogBackup` - 117MB (caller log backup)
- Per-door logs accumulate over time

**Prevention:**

1. Run log rotation: `./dev/scripts/rotate-logs.sh`
2. Logs over 50MB are automatically rotated (keeps last 2 copies)
3. Old per-door logs are cleaned (keeps last 50)

**Manual cleanup:**
```bash
# Clear main door log
> logs/door-68k.log

# Remove backup logs
rm Node1/CLogBackup

# Clean old per-door logs
find logs -name "door-68k-*-*.log" -mtime +7 -delete
```

## Monitoring

### Check Disk Usage

Run the disk usage checker:
```bash
./dev/scripts/check-disk-usage.sh
```

This shows:
- Total project size
- Top 10 largest directories
- Warnings for door node_modules
- Warnings for large log files
- Actionable cleanup commands

**Expected project size:** 3-4 GB (healthy)
**Warning threshold:** 6+ GB (indicates bloat)

### Periodic Maintenance

Add to your workflow:
```bash
# Weekly cleanup (add to cron or run manually)
./dev/scripts/clean-door-dependencies.sh
./dev/scripts/rotate-logs.sh
./dev/scripts/check-disk-usage.sh
```

## Scripts Reference

### clean-door-dependencies.sh
Removes all node_modules from Doors/ directory.
- **When to run:** After door updates, when disk space is low
- **Safe:** Doors still work via file: links to SDK
- **Impact:** Saves 6+ GB

### rotate-logs.sh
Rotates log files over 50MB, keeps last 2 copies, cleans old per-door logs.
- **When to run:** Weekly, or when logs grow large
- **Safe:** Old logs are preserved as .1 and .2
- **Impact:** Saves 100+ MB

### check-disk-usage.sh
Reports disk usage and identifies bloat sources.
- **When to run:** Anytime, add to development workflow
- **Safe:** Read-only, no changes made
- **Impact:** Helps identify issues early

## Root Cause Analysis

The disk bloat was caused by:

1. **No .npmignore in SDK** - npm copied everything when using file: dependencies
2. **No "files" field in SDK package.json** - npm didn't know what to include
3. **Nested examples with node_modules** - created exponential duplication
4. **Unbounded log growth** - no rotation mechanism

All issues have been fixed with:
- SDK `.npmignore` excluding examples/tools/tests
- SDK `package.json` "files" field limiting to dist/
- Cleanup scripts for maintenance
- Log rotation mechanism
- Documentation and monitoring tools

## Best Practices

### For Door Development

1. **Never commit node_modules** in Doors/ (already in .gitignore)
2. **Use file: dependencies** - they work correctly now with .npmignore
3. **Run cleanup after updates** - keeps workspace clean
4. **Check disk usage periodically** - catch issues early

### For SDK Development

1. **Keep examples/ separate** - not included in npm package
2. **Keep tools/ separate** - preview server excluded from package
3. **Only dist/ is distributed** - enforced by .npmignore and "files" field
4. **Test packaging:** `npm pack` should create small tarball (~20MB max)

### For Server Operation

1. **Rotate logs regularly** - prevent unbounded growth
2. **Monitor disk usage** - run check-disk-usage.sh weekly
3. **Clean old logs** - per-door logs accumulate over time
4. **Watch for bloat** - total size should stay under 5GB

## Troubleshooting

### "Disk full" errors

1. Run: `./dev/scripts/check-disk-usage.sh`
2. Identify largest directories
3. Run cleanup scripts as recommended
4. If still full, check for non-project files

### Doors not working after cleanup

Doors use `file:` dependencies - they load SDK from `sdk/dist/`, not from their own node_modules.
Ensure SDK is built: `cd sdk && npm run build`

### SDK changes not reflected in doors

When you modify SDK source:
1. Rebuild SDK: `cd sdk && npm run build`
2. Doors will pick up changes automatically (file: link)
3. No need to reinstall door dependencies

## Summary

**Before fixes:** 9.8 GB (6 GB bloat)
**After fixes:** 3.7 GB (healthy size)
**Savings:** 6.1 GB (62% reduction)

The project now has:
- Proper npm packaging (only dist/ distributed)
- Automatic cleanup scripts
- Log rotation mechanism
- Monitoring tools
- Documentation and best practices
