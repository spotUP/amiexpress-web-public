import React, { useCallback, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import * as fs from 'fs';
import type { TabName } from './TabBar.js';
import { useHotkeyClicks, parseHotkeys, dispatchKey } from '../hooks/useHotkeyClick.js';
import { useMouse, type MouseClick } from '../hooks/useMouse.js';

const DBG = process.env['CONSOLE_MOUSE_DEBUG']
  ? '/tmp/console-mouse-debug.log' : null;
function dbg(msg: string) {
  if (DBG) try { fs.appendFileSync(DBG, `${new Date().toISOString()} [Footer] ${msg}\n`); } catch {}
}

const HINTS: Record<TabName, string> = {
  Dashboard: 'live stats + 24h sparkline  auto-refresh 10s',
  Nodes:     '[k]ick  [c]hat  [↑↓] select',
  Users:     '[e]dit SL  [b]an  [d]el  [/]search  [↑↓] scroll',
  Confs:     '[t]oggle  [h]ealth  [f]ix  [r]efresh  [↑↓] scroll',
  Callers:   '[↑↓] scroll  auto-refresh 30s',
  Logs:      '[b]ackend  [p]review  [d]oor-watcher  [6]8k',
  Doors:     '[r]efresh  [R]eload all doors  [↑↓] scroll',
  System:    '[n]odes  [c]onfig  [s]tart  [x]exit  [v]reserve  [o]sysop  [Q]uiet',
};

const RIGHT_HINT = '[?]help  [q]quit';

interface Props {
  activeTab: TabName;
}

export function Footer({ activeTab }: Props) {
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 24;
  const termWidth  = stdout?.columns ?? 80;
  // Footer is the bottom 3 rows: top border, content, bottom border.
  // Content row is the second-to-last screen row (1-indexed).
  const FOOTER_ROW = termHeight - 1;

  useEffect(() => {
    dbg(`mounted: termHeight=${termHeight} termWidth=${termWidth} FOOTER_ROW=${FOOTER_ROW}`);
  }, [termHeight, termWidth, FOOTER_ROW]);

  // Left hint starts at col 3 (1 border + 1 padding + 1).
  const leftHint = HINTS[activeTab];

  // Track ALL clicks while Footer is mounted, so we can see exactly where
  // the user is clicking vs where we expect the Footer to be.
  const onAnyClick = useCallback((e: MouseClick) => {
    if (e.button !== 0) return;
    dbg(`click row=${e.row} col=${e.col} (FOOTER_ROW=${FOOTER_ROW})`);
    if (e.row !== FOOTER_ROW) return;
    // Try left hint first
    for (const r of parseHotkeys(leftHint, 3)) {
      if (e.col >= r.from && e.col <= r.to) {
        dbg(`HIT left ${JSON.stringify(r)} → dispatch '${r.key}'`);
        dispatchKey(r.key);
        return;
      }
    }
    // Then right hint
    const rightStart = termWidth - 1 - 1 - RIGHT_HINT.length + 1;
    for (const r of parseHotkeys(RIGHT_HINT, rightStart)) {
      if (e.col >= r.from && e.col <= r.to) {
        dbg(`HIT right ${JSON.stringify(r)} → dispatch '${r.key}'`);
        dispatchKey(r.key);
        return;
      }
    }
    dbg(`no hit on row ${e.row}`);
  }, [FOOTER_ROW, leftHint, termWidth]);
  useMouse(onAnyClick);

  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
      <Text dimColor>{leftHint}</Text>
      <Text dimColor>{RIGHT_HINT}</Text>
    </Box>
  );
}
