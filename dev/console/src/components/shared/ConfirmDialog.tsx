import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { T } from '../../theme/blessed-theme.js';

interface Props {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * For the most destructive actions - matches
   * web/config-app/src/components/ui/ConfirmDialog.tsx's
   * `requireTypedConfirmation`. The dialog switches from a y/n choice to a
   * free-text field; [enter] only fires onConfirm once the typed text
   * (trimmed) equals this string exactly. Reserve this for actions a y/n
   * keypress is too easy to fire by reflex - a door delete that also takes
   * its directory and every alias registration with it, for instance.
   */
  requireTypedConfirmation?: string;
}

export function ConfirmDialog({ message, onConfirm, onCancel, requireTypedConfirmation }: Props) {
  const [selected, setSelected] = useState<'yes' | 'no'>('no');
  const [typed, setTyped] = useState('');
  const fired = React.useRef(false);

  const typedMode = requireTypedConfirmation !== undefined;
  const blocked = typedMode && typed.trim() !== requireTypedConfirmation;

  useInput((input, key) => {
    if (fired.current) return;

    if (typedMode) {
      // Free text only: no y/n shortcuts here, since the string the sysop
      // has to type back (a door command, a username) may itself contain
      // 'y' or 'n'.
      if (key.escape) { fired.current = true; onCancel(); return; }
      if (key.return) {
        if (!blocked) { fired.current = true; onConfirm(); }
        return;
      }
      if (key.backspace || key.delete) { setTyped(t => t.slice(0, -1)); return; }
      if (input && !key.ctrl && !key.meta) setTyped(t => t + input);
      return;
    }

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
      {typedMode ? (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>
            Type <Text color={T.accent} bold>{requireTypedConfirmation}</Text> to confirm:
          </Text>
          <Text color={blocked ? T.ink : T.ok}>{typed}█</Text>
          <Box marginTop={1}>
            <Text dimColor>[enter] confirm  [esc] cancel</Text>
          </Box>
        </Box>
      ) : (
        <>
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
        </>
      )}
    </Box>
  );
}
