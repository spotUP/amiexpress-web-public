import React from 'react';
import { Box, Text, useStdout } from 'ink';
import Gradient from 'ink-gradient';
import { useUptime } from '../hooks/useUptime.js';
import { T, BORDER_STYLE } from '../theme/blessed-theme.js';

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

  const borderChar = '-';
  const topBorder = borderChar.repeat(termWidth);
  const bottomBorder = borderChar.repeat(termWidth);

  return (
    <Box flexDirection="column" width={termWidth}>
      <Text color={T.chrome}>{topBorder}</Text>
      <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
        <Box>
          <Gradient name="rainbow">
            <Text bold>AmiExpress-Web</Text>
          </Gradient>
          <Text color={T.dim}>  Ultra Vibed by Spot/Up Rough</Text>
        </Box>
        <Box flexDirection="row" gap={3}>
          {username && <Text color={T.dim}>sysop: {username}</Text>}
          <Text color={T.dim}>UP {uptime}</Text>
          <StatusPill label="Backend" up={backendUp} />
          <StatusPill label="Preview" up={previewUp} />
          <StatusPill label="Watch" up={watchUp} />
        </Box>
      </Box>
      <Text color={T.chrome}>{bottomBorder}</Text>
    </Box>
  );
}