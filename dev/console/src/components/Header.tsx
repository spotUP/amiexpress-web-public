import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import Gradient from 'ink-gradient';
import { useUptime } from '../hooks/useUptime.js';
import { T, Rail } from '../theme/blessed-theme.js';

interface Props {
  username: string | null;
  backendUp: boolean;
  previewUp: boolean;
  watchUp: boolean;
}

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
  const [railFrame, setRailFrame] = useState(0);

  // Animate slashes every 250ms
  useEffect(() => {
    const id = setInterval(() => setRailFrame(f => f + 1), 250);
    return () => clearInterval(id);
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