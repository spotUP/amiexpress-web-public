import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';

const SPINNER = ['|', '/', '-', '\\'];

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
  const [spinIdx, setSpinIdx] = useState(0);
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
      setSpinIdx(i => (i + 1) % SPINNER.length);
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

  if (!backendReady) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" height="100%">
        <Box flexDirection="column" borderStyle="double" borderColor="yellow" padding={2} width={50}>
          <Text bold color="cyan">AmiExpress-Web Console</Text>
          <Text dimColor>Ultra Vibed by Spot/Up Rough</Text>
          <Box marginTop={1} />
          <Text color="yellow">{SPINNER[spinIdx]} Waiting for backend{dots}</Text>
          <Box marginTop={1} />
          <Text dimColor>The BBS server is starting up. Login will</Text>
          <Text dimColor>appear automatically when it is ready.</Text>
        </Box>
      </Box>
    );
  }

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
