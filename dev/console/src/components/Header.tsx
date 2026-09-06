import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import Gradient from 'ink-gradient';
import { useUptime } from '../hooks/useUptime.js';
import { T, Rail, CURRENT_THEME } from '../theme/blessed-theme.js';
import { startRailAnimation } from '../theme/rail-animator.js';

interface Props {
  username: string | null;
  backendUp: boolean;
  previewUp: boolean;
  watchUp: boolean;
}

/** The rail's cell: the header is the first row, inside paddingX={1}. */
const RAIL_ROW = 1;
const RAIL_COL = 2;

function StatusPill({ label, up }: { label: string; up: boolean }) {
  return (
    <Box marginRight={2} flexDirection="row" gap={1}>
      <Text color={up ? T.ok : T.alert}>{up ? '*' : 'o'}</Text>
      <Text color={up ? T.ok : T.alert}>{up ? '[OK]' : '[!]'}</Text>
      <Text color={T.dim}>{label}</Text>
    </Box>
  );
}

export function Header({ username, backendUp, previewUp, watchUp }: Props) {
  const uptime = useUptime();
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;
  // The rail animates without React: it is painted straight into its own
  // cells (row 1, just inside the header's paddingX of 1). Driving it from
  // state repainted the whole frame 4x/sec, because Ink renders the frame as
  // one string. What Ink draws here is the static frame-0 placeholder, so the
  // layout and its width are unchanged.
  const railFrame = 0;
  useEffect(() => {
    const animation = startRailAnimation({
      rail: CURRENT_THEME.rail,
      colour: T.accent,
      row: RAIL_ROW,
      col: RAIL_COL,
    });
    return () => animation.stop();
  }, []);

  return (
    <Box flexDirection="column" width={termWidth}>
      <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
        <Box flexDirection="row" gap={2}>
          <Text color={T.chrome} bold><Rail frame={railFrame} /></Text>
          <Gradient name="rainbow">
            <Text bold>AmiExpress-Web</Text>
          </Gradient>
          <Text color={T.dim}>Ultra Vibed by Spot/Up Rough</Text>
        </Box>
        <Box flexDirection="row" gap={3}>
          {username && <Text color={T.dim}>sysop: {username}</Text>}
          <Text color={T.dim}>UP {uptime}</Text>
          <StatusPill label="Backend" up={backendUp} />
          <StatusPill label="Preview" up={previewUp} />
          <StatusPill label="Watch" up={watchUp} />
        </Box>
      </Box>
      <Text color={T.chrome}>{'='.repeat(termWidth)}</Text>
    </Box>
  );
}