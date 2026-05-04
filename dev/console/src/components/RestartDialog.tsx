/**
 * Restart dialog (F2)
 *
 * Lets the sysop pick start-servers.sh flags and restart the dev stack.
 *
 * The TUI itself runs inside the stack, so a restart kills our own process —
 * we shell out via `nohup setsid` so the kill→start chain survives our exit,
 * then quit. The user sees the new servers come up in the same tmux layout.
 *
 * Mirrors the flag matrix in dev/scripts/start-servers.sh:
 *   --debug | --quick | --clean       (mode, mutually exclusive)
 *   --full / --bbs-only / --sdk-only / --telnet-only  (scope, mutually exclusive)
 *   --no-watch                        (toggle)
 */

import React, { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

type Mode = 'normal' | 'debug' | 'quick' | 'clean';
type Scope = 'full' | 'bbs-only' | 'sdk-only' | 'telnet-only';

interface Props {
  onClose: () => void;
}

const MODES: Array<[Mode, string, string]> = [
  ['normal', 'Normal',         'default — clean output'],
  ['debug',  '--debug',        'verbose 68K + XIM + DOS logs, profiling'],
  ['quick',  '--quick',        'skip all builds & cache clearing (fastest)'],
  ['clean',  '--clean',        'nuclear cache clear (slow)'],
];

const SCOPES: Array<[Scope, string, string]> = [
  ['full',        '--full (default)', 'BBS + Admin + SDK preview'],
  ['bbs-only',    '--bbs-only',       'BBS terminal only'],
  ['sdk-only',    '--sdk-only',       'SDK preview only'],
  ['telnet-only', '--telnet-only',    'backend only — no frontends'],
];

function buildCommand(mode: Mode, scope: Scope, noWatch: boolean): string[] {
  const args: string[] = [];
  if (mode !== 'normal') args.push(`--${mode}`);
  if (scope !== 'full') args.push(`--${scope}`);
  if (noWatch) args.push('--no-watch');
  return args;
}

export function RestartDialog({ onClose }: Props) {
  const { exit } = useApp();
  const [mode, setMode] = useState<Mode>('normal');
  const [scope, setScope] = useState<Scope>('full');
  const [noWatch, setNoWatch] = useState(false);
  // 0..MODES.length-1 = mode rows
  // next 4 = scope rows
  // next 1 = no-watch row
  const totalRows = MODES.length + SCOPES.length + 1;
  const [cursor, setCursor] = useState(0);

  const startArgs = buildCommand(mode, scope, noWatch);
  const cmdLine = ['./dev/scripts/start-servers.sh', ...startArgs].join(' ');

  function doRestart() {
    // Find the repo root by walking up from this file's location until we find
    // dev/scripts/start-servers.sh — same lookup the rest of the TUI does.
    let root = process.cwd();
    for (let i = 0; i < 6; i++) {
      if (fs.existsSync(path.join(root, 'dev', 'scripts', 'start-servers.sh'))) break;
      root = path.dirname(root);
    }

    const killScript  = path.join(root, 'dev', 'scripts', 'kill-servers.sh');
    const startScript = path.join(root, 'dev', 'scripts', 'start-servers.sh');

    // Detached chain that survives the TUI exit. Output goes to a log so the
    // user can tail it after if anything goes wrong on bring-up.
    const logPath = path.join(root, 'logs', 'restart.log');
    try { fs.mkdirSync(path.dirname(logPath), { recursive: true }); } catch {}

    const shellCmd = `${killScript} >> ${logPath} 2>&1 ; sleep 1 ; ${startScript} ${startArgs.join(' ')} >> ${logPath} 2>&1`;
    const child = spawn('/bin/bash', ['-c', shellCmd], {
      cwd: root,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    // Print the command on the way out so the user can see what fired.
    process.stdout.write(`\nRestarting: ${cmdLine}\n(log: ${logPath})\n`);
    exit();
  }

  useInput((input, key) => {
    if (key.escape) { onClose(); return; }
    if (key.upArrow)   { setCursor(c => (c - 1 + totalRows) % totalRows); return; }
    if (key.downArrow) { setCursor(c => (c + 1) % totalRows); return; }
    if (key.return || input === ' ') {
      // Apply selection / toggle for the current row
      if (cursor < MODES.length) {
        setMode(MODES[cursor][0]);
      } else if (cursor < MODES.length + SCOPES.length) {
        setScope(SCOPES[cursor - MODES.length][0]);
      } else {
        setNoWatch(v => !v);
      }
      return;
    }
    if (input === 'r' || input === 'R' || (key as any).f10) {
      doRestart();
      return;
    }
  });

  function rowMarker(active: boolean) {
    return active ? '●' : '○';
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} borderStyle="double" borderColor="cyan">
      <Text bold color="cyan">Restart dev stack</Text>
      <Text dimColor>Pick options, then [r] or [F10] to restart. [esc] to cancel.</Text>

      <Box marginTop={1} flexDirection="column">
        <Text bold color="cyan" dimColor>Mode</Text>
        {MODES.map(([m, label, hint], i) => {
          const focused = cursor === i;
          const selected = mode === m;
          return (
            <Box key={m}>
              <Text color={focused ? 'cyan' : undefined}>{focused ? '▶ ' : '  '}</Text>
              <Box width={3}><Text color={selected ? 'green' : undefined}>{rowMarker(selected)}</Text></Box>
              <Box width={20}><Text bold={selected}>{label}</Text></Box>
              <Text dimColor>{hint}</Text>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold color="cyan" dimColor>Scope</Text>
        {SCOPES.map(([s, label, hint], i) => {
          const row = MODES.length + i;
          const focused = cursor === row;
          const selected = scope === s;
          return (
            <Box key={s}>
              <Text color={focused ? 'cyan' : undefined}>{focused ? '▶ ' : '  '}</Text>
              <Box width={3}><Text color={selected ? 'green' : undefined}>{rowMarker(selected)}</Text></Box>
              <Box width={20}><Text bold={selected}>{label}</Text></Box>
              <Text dimColor>{hint}</Text>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold color="cyan" dimColor>Flags</Text>
        {(() => {
          const row = MODES.length + SCOPES.length;
          const focused = cursor === row;
          return (
            <Box>
              <Text color={focused ? 'cyan' : undefined}>{focused ? '▶ ' : '  '}</Text>
              <Box width={3}><Text color={noWatch ? 'green' : undefined}>{noWatch ? '✓' : ' '}</Text></Box>
              <Box width={20}><Text bold={noWatch}>--no-watch</Text></Box>
              <Text dimColor>disable door file watcher</Text>
            </Box>
          );
        })()}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold color="cyan" dimColor>Resolved command</Text>
        <Text color="yellow">{cmdLine}</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>[↑↓] move  [enter/space] toggle/select  [r] restart  [esc] cancel</Text>
      </Box>
    </Box>
  );
}
