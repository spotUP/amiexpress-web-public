import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { T } from '../theme/blessed-theme.js';

interface Props {
  error: string | null;
  loading: boolean;
  onLogin: (username: string, password: string) => void;
}

export function LoginPrompt({ error, loading, onLogin }: Props) {
  const [field, setField] = useState<'username' | 'password'>('username');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const dots = useDots();

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

  const FIELD_W = 30;
  const renderField = (value: string, active: boolean) => {
    const cursor = active ? '_' : ' ';
    const padded = (value + cursor).padEnd(FIELD_W + 1, ' ');
    return <Text>{padded}</Text>;
  };

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center">
      <Box flexDirection="column" borderStyle="single" borderColor={T.chrome} padding={2} width={52}>
        <Text bold color={T.accent}>AmiExpress-Web Console</Text>
        <Text color={T.dim}>Ultra Vibed by Spot/Up Rough</Text>
        <Box marginTop={1} />

        <Box flexDirection="column" gap={1}>
          <Box>
            <Text color={field === 'username' ? T.accent : T.dim}>Username: </Text>
            {renderField(username, field === 'username')}
          </Box>
          <Box>
            <Text color={field === 'password' ? T.accent : T.dim}>Password: </Text>
            {renderField('*'.repeat(password.length), field === 'password')}
          </Box>
        </Box>

        {error && (
          <Box marginTop={1}>
            <Text color={T.alert}>{error}</Text>
          </Box>
        )}
        {loading && (
          <Box marginTop={1}>
            <Text color={T.accent}>Authenticating{dots}</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text color={T.dim}>[tab] switch field  [enter] next/login</Text>
        </Box>
      </Box>
    </Box>
  );
}

function useDots(): string {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 250);
    return () => clearInterval(id);
  }, []);
  return dots;
}
