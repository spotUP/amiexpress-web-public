import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { useUptime } from '../hooks/useUptime.js';
import { THEME, BOX, BORDER_STYLE } from '../theme/blessed-theme.js';

interface Props {
  username: string | null;
  backendUp: boolean;
  previewUp: boolean;
  watchUp: boolean;
}

function StatusPill({ label, up }: { label: string; up: boolean }) {
  return (
    <Box marginRight={2} flexDirection="row" gap={1}>
      <Text color={up ? THEME.success.fg : THEME.danger.fg}>{up ? '●' : '○'}</Text>
      <Text color={up ? THEME.success.fg : THEME.danger.fg}>{up ? '✓' : '✗'}</Text>
      <Text dimColor>{label}</Text>
    </Box>
  );
}

function BlessedBorder({ children }: { children: React.ReactNode }) {
  const width = 80;
  const top = BOX.double.topLeft + BOX.double.horizontal.repeat(width - 2) + BOX.double.topRight;
  const bottom = BOX.double.bottomLeft + BOX.double.horizontal.repeat(width - 2) + BOX.double.bottomRight;

  return (
    <Box flexDirection="column" width={width}>
      <Text color={THEME.border.fg}>{top}</Text>
      <Box flexDirection="row" width={width - 2} paddingX={1}>
        <Text color={THEME.border.fg}>{BOX.double.vertical}</Text>
        <Box flexGrow={1}>{children}</Box>
        <Text color={THEME.border.fg}>{BOX.double.vertical}</Text>
      </Box>
      <Text color={THEME.border.fg}>{bottom}</Text>
    </Box>
  );
}

export function Header({ username, backendUp, previewUp, watchUp }: Props) {
  const uptime = useUptime();

  return (
    <BlessedBorder>
      <Box justifyContent="space-between">
        <Box>
          <Gradient name="rainbow">
            <Text bold>{BOX.double.vertical} AmiExpress-Web {BOX.double.vertical}</Text>
          </Gradient>
          <Text dimColor>{BOX.single.vertical}  Ultra Vibed by Spot/Up Rough</Text>
        </Box>
        <Box flexDirection="row" gap={3}>
          {username && <Text dimColor>{BOX.single.vertical} sysop: {username}</Text>}
          <Text dimColor>{BOX.single.vertical} UP {uptime}</Text>
          <StatusPill label="Backend" up={backendUp} />
          <StatusPill label="Preview" up={previewUp} />
          <StatusPill label="Watch" up={watchUp} />
        </Box>
      </Box>
    </BlessedBorder>
  );
}