import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface Props {
  error: string | null;
  loading: boolean;
  onLogin: (username: string, password: string) => void;
}

export function LoginPrompt({ error, loading, onLogin }: Props) {
  const [field, setField] = useState<'username' | 'password'>('username');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useInput((input, key) => {
    if (loading) return;

    if (key.return) {
      if (field === 'username') {
        setField('password');
      } else if (username && password) {
        onLogin(username, password);
      }
      return;
    }
    if (key.tab) {
      setField(f => f === 'username' ? 'password' : 'username');
      return;
    }
    if (key.backspace || key.delete) {
      if (field === 'username') setUsername(u => u.slice(0, -1));
      else setPassword(p => p.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      if (field === 'username') setUsername(u => u + input);
      else setPassword(p => p + input);
    }
  });

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" height="100%">
      <Box flexDirection="column" borderStyle="double" borderColor="cyan" padding={2} width={50}>
        <Text bold color="cyan">AmiExpress-Web Console</Text>
        <Text dimColor>Ultra Vibed by Spot/Up Rough</Text>
        <Box marginTop={1} />

        <Box flexDirection="column" gap={1}>
          <Box>
            <Text color={field === 'username' ? 'cyan' : 'white'}>Username: </Text>
            <Text>{username}{field === 'username' ? '█' : ''}</Text>
          </Box>
          <Box>
            <Text color={field === 'password' ? 'cyan' : 'white'}>Password: </Text>
            <Text>{'*'.repeat(password.length)}{field === 'password' ? '█' : ''}</Text>
          </Box>
        </Box>

        {error && (
          <Box marginTop={1}>
            <Text color="red">{error}</Text>
          </Box>
        )}
        {loading && (
          <Box marginTop={1}>
            <Text color="yellow">Authenticating...</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>[tab] switch field  [enter] next/login</Text>
        </Box>
      </Box>
    </Box>
  );
}
