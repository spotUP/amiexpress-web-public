import React from 'react';
import { Box, Text, useInput } from 'ink';
import { pageById } from '../pages/registry.js';

const GLOBAL: Array<[string, string]> = [
  ['1-6',   'Jump to category (Live / Users / Content / Files / System / Comms)'],
  ['↑↓',    'Move sidebar selection'],
  ['?',     'Toggle this help'],
  ['q',     'Quit the console'],
  ['esc',   'Close any dialog/help'],
  ['click', 'Sidebar items, list rows, and footer hotkeys are all clickable'],
];

interface Props {
  activePageId: string;
  onClose: () => void;
}

export function HelpOverlay({ activePageId, onClose }: Props) {
  const page = pageById(activePageId);
  useInput((_input, key) => {
    if (key.escape || key.return) onClose();
  });

  const tabKeys = page?.helpKeys ?? [];

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} borderStyle="double" borderColor="cyan">
      <Text bold color="cyan">Help — {page?.label ?? activePageId}</Text>
      {tabKeys.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          {tabKeys.map(([k, desc], i) => (
            <Box key={i}>
              <Box width={10}><Text color="yellow">{k}</Text></Box>
              <Text>{desc}</Text>
            </Box>
          ))}
        </Box>
      )}
      <Box marginTop={1} flexDirection="column">
        <Text bold color="cyan" dimColor>Global</Text>
        {GLOBAL.map(([k, desc], i) => (
          <Box key={i}>
            <Box width={10}><Text color="yellow">{k}</Text></Box>
            <Text dimColor>{desc}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>[?] or [esc] to close</Text>
      </Box>
    </Box>
  );
}
