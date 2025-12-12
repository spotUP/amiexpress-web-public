#!/bin/bash
# Rotate large log files to prevent unbounded growth
# Run this periodically or add to cron

set -e

LOG_DIR="logs"
MAX_SIZE_MB=50
MAX_SIZE_BYTES=$((MAX_SIZE_MB * 1024 * 1024))

echo "[INFO] Rotating logs larger than ${MAX_SIZE_MB}MB..."

# Function to rotate a log file
rotate_log() {
  local log_file=$1
  local size=$(stat -f%z "$log_file" 2>/dev/null || stat -c%s "$log_file" 2>/dev/null)

  if [ "$size" -gt "$MAX_SIZE_BYTES" ]; then
    local size_mb=$((size / 1024 / 1024))
    echo "[INFO] Rotating $log_file (${size_mb}MB)"

    # Keep last 2 rotations
    [ -f "${log_file}.2" ] && rm -f "${log_file}.2"
    [ -f "${log_file}.1" ] && mv "${log_file}.1" "${log_file}.2"

    # Rotate current log
    mv "$log_file" "${log_file}.1"
    touch "$log_file"

    echo "[OK] Rotated $log_file"
  fi
}

# Rotate door-68k.log if exists
if [ -f "$LOG_DIR/door-68k.log" ]; then
  rotate_log "$LOG_DIR/door-68k.log"
fi

# Rotate backend.log if large
if [ -f "$LOG_DIR/backend.log" ]; then
  rotate_log "$LOG_DIR/backend.log"
fi

# Clean old per-door logs (keep last 50)
find "$LOG_DIR" -name "door-68k-*-*.log" -type f 2>/dev/null | sort -r | tail -n +51 | while read file; do
  echo "[INFO] Removing old log: $file"
  rm -f "$file"
done

echo "[INFO] Log rotation complete"
