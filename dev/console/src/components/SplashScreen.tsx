import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import { T } from '../theme/blessed-theme.js';

const LOGO = [
  '.             -- - ---/--------------------------------------------------------.',
  '   _ _______. _ _  _/____ _ __                                                |',
  ' ._\\\\\\__    |_\\\\\\\\/     /_\\\\\\_)__.                                            |',
  ' |    _/    |    \\/    /         |                                            :',
  ' |    \\_    |    /    /          |                                            .',
  ' |_____|____|___/    / __________|',
  '   _ _____ _ __/_  __\\__ _ ________ _ _______   _ _____   ______ _   ______ _ .',
  ' ._\\\\\\ __/_\\\\\\   \\/.   /_\\\\\\_     /_\\\\\\_     \\ _\\\\\\ __/_._\\  __///_._\\  __///_:',
  ' |    _\\    \\\\_  // __//   _/    /     /     //    _\\   |  \\_      |  \\_      |',
  ' |          /   //    \\    \\____/     /    _/_          |   /      |   /      |',
  ' |_________/___//\\_____\\____|    |    \\______/__________|__________|__________|',
  '     ____ /    _ _____  ._____.  |_____|tGø                                   |',
  ' .___\\  ///_. _\\\\\\ __/__|  _ _|____                                           !',
  ' |    \\     |/    _\\    |  \\\\\\__   \\                                          :',
  ' |    /\\    |           |     |/    \\                                         .',
  ' |____/\\____|___________|_____/_____/                                         .',
  '     /                                                                        |',
  '- --/-------------------------------------------------------------------------\'',
  '   .',
];

interface SplashScreenProps {
  onDone: () => void;
}

export function SplashScreen({ onDone }: SplashScreenProps) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" paddingTop={2}>
      {LOGO.map((line, i) => (
        <Text key={i} color={T.accent}>
          {line}
        </Text>
      ))}
      <Box marginTop={1}>
        <Text color={T.dim}>Connecting...</Text>
      </Box>
    </Box>
  );
}