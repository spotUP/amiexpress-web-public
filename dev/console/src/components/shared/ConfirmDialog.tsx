import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface Props {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: Props) {
  const [selected, setSelected] = useState<'yes' | 'no'>('no');

  useInput((input, key) => {
    if (key.leftArrow || input === 'h') setSelected('yes');
    if (key.rightArrow || input === 'l') setSelected('no');
    if (key.return) selected === 'yes' ? onConfirm() : onCancel();
    if (input === 'y') onConfirm();
    if (input === 'n' || key.escape) onCancel();
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1} width={50}>
      <Text>{message}</Text>
      <Box marginTop={1} gap={4}>
        <Text color={selected === 'yes' ? 'green' : 'white'} bold={selected === 'yes'}>
          {selected === 'yes' ? '▶ Yes' : '  Yes'}
        </Text>
        <Text color={selected === 'no' ? 'red' : 'white'} bold={selected === 'no'}>
          {selected === 'no' ? '▶ No' : '  No'}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>[y]es  [n]o  [←/→] select  [enter] confirm</Text>
      </Box>
    </Box>
  );
}
