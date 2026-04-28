import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { useUptime } from '../hooks/useUptime.js';

interface Props {
  username: string | null;
  backendUp: boolean;
  previewUp: boolean;
  watchUp: boolean;
}

function Pill({ label, up }: { label: string; up: boolean }) {
  return (
    <Box marginRight={2}>
      <Text color={up ? 'green' : 'red'}>{up ? '●' : '○'}</Text>
      <Text> {label} {up ? '✓' : '✗'}</Text>
    </Box>
  );
}

export function Header({ username, backendUp, previewUp, watchUp }: Props) {
  const uptime = useUptime();

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Box justifyContent="space-between">
        <Box>
          <Gradient name="rainbow">
            <Text bold>AmiExpress-Web</Text>
          </Gradient>
          <Text dimColor>  Ultra Vibed by Spot/Up Rough</Text>
        </Box>
        <Box>
          {username && <Text dimColor>sysop: {username}  </Text>}
          <Text dimColor>UP {uptime}</Text>
        </Box>
      </Box>
      <Box marginTop={0}>
        <Pill label="Backend" up={backendUp} />
        <Pill label="Preview" up={previewUp} />
        <Pill label="Watch" up={watchUp} />
      </Box>
    </Box>
  );
}
