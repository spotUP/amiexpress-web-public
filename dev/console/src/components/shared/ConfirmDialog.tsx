import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { T } from '../../theme/blessed-theme.js';

interface Props {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: Props) {
  const [selected, setSelected] = useState<'yes' | 'no'>('no');
  const fired = React.useRef(false);

  useInput((input, key) => {
    if (fired.current) return;
    if (key.leftArrow || input === 'h') setSelected('yes');
    if (key.rightArrow || input === 'l') setSelected('no');
    if (key.return) {
      fired.current = true;
      selected === 'yes' ? onConfirm() : onCancel();
    }
    if (input === 'y') { fired.current = true; onConfirm(); }
    if (input === 'n' || key.escape) { fired.current = true; onCancel(); }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={T.warn} padding={1} width={50}>
      <Text>{message}</Text>
      <Box marginTop={1} gap={4}>
        <Text color={selected === 'yes' ? T.ok : T.ink} bold={selected === 'yes'}>
          {selected === 'yes' ? '▶ Yes' : '  Yes'}
        </Text>
        <Text color={selected === 'no' ? T.alert : T.ink} bold={selected === 'no'}>
          {selected === 'no' ? '▶ No' : '  No'}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>[y]es  [n]o  [←/→] select  [enter] confirm</Text>
      </Box>
    </Box>
  );
}
