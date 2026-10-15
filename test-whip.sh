#!/bin/bash
# Test WHIP door

(
  sleep 1
  echo ""  # Username prompt
  sleep 1
  echo "sysop"  # Username
  sleep 1
  echo "test123"  # Password
  sleep 2
  echo "WHIP"  # Run WHIP command
  sleep 5
  echo "Q"  # Quit
  sleep 1
  echo "Q"  # Quit BBS
) | telnet localhost 64128
