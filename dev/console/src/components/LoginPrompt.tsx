import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { T, BlessedText, BlessedSpinner } from '../theme/blessed-theme.js';

interface Props {
  error: string | null;
  loading: boolean;
  onLogin: (username: string, password: string) => void;
}

export function LoginPrompt({ error, loading, onLogin }: Props) {
  const [field, setField] = useState<'username' | 'password'>('username');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [backendReady, setBackendReady] = useState(false);
  const [dots, setDots] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const url = (process.env['AMIEXPRESS_URL'] ?? 'http://localhost:3001') + '/health';
        const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (!cancelled && res.ok) {
          setBackendReady(true);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // not ready yet
      }
    };
    check();
    pollRef.current = setInterval(check, 2000);
    return () => { cancelled = true; if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Animate the spinner + dots while waiting
  useEffect(() => {
    if (backendReady) return;
    const id = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 250);
    return () => clearInterval(id);
  }, [backendReady]);

  useInput((input, key) => {
    if (loading || !backendReady) return;

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

  // Fixed-width input: pad to 30 chars so layout never shifts.
  // Blinking `_` cursor avoids the full-width █ wrapping bug in some terminals.
  const FIELD_W = 30;
  const cursorChar = '_';
  const renderField = (value: string, active: boolean) => {
    const cursor = active ? cursorChar : ' ';
    const padded = (value + cursor).padEnd(FIELD_W + 1, ' ');
    return <Text>{padded}</Text>;
  };

  if (!backendReady) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center">
        <Box flexDirection="column" borderStyle="single" borderColor={T.accent} padding={2} width={52}>
          <Text bold color={T.accent}>AmiExpress-Web Console</Text>
          <Text color={T.dim}>Ultra Vibed by Spot/Up Rough</Text>
          <Box marginTop={1} />
          <Box flexDirection="row" gap={1}>
            <Text color={T.accent}>Waiting for backend{dots}</Text>
          </Box>
          <Box marginTop={1} />
          <Text color={T.dim}>The BBS server is starting up. Login will</Text>
          <Text color={T.dim}>appear automatically when it is ready.</Text>
        </Box>
      </Box>
    );
  }

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
            <Text color={T.accent}>Authenticating...</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text color={T.dim}>[tab] switch field  [enter] next/login</Text>
        </Box>
      </Box>
    </Box>
  );
}
