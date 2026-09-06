import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { T } from '../theme/blessed-theme.js';
import { loadLogo, logoFits, LOGO_WIDTH } from '../theme/logo.js';
import { probeBackend, backendUrl } from '../api/client.js';

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
  const { stdout } = useStdout();
  const logo = useLogo(stdout?.columns);
  const ready = useBackendReady();

  useInput((input, key) => {
    if (loading) return;

    if (key.return) {
      if (field === 'username') {
        setField('password');
      } else if (username && password && ready) {
        // Submitting before the backend answers can only produce a failure,
        // so Enter holds here until it does.
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

  // The art is wider than the plain box, so the box grows to hold it and
  // shrinks back on a narrow terminal where the logo is not drawn at all.
  const boxWidth = logo.length > 0 ? LOGO_WIDTH + 6 : 52;

  const FIELD_W = 30;
  const renderField = (value: string, active: boolean) => {
    const cursor = active ? '_' : ' ';
    const padded = (value + cursor).padEnd(FIELD_W + 1, ' ');
    return <Text>{padded}</Text>;
  };

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center">
      <Box flexDirection="column" borderStyle="single" borderColor={T.chrome} padding={2} width={boxWidth}>
        {logo.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {logo.map((line, i) => (
              <Text key={i} color={T.accent}>{line}</Text>
            ))}
          </Box>
        )}
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
        {!ready && (
          <Box marginTop={1}>
            <Text color={T.dim}>Waiting for the backend at {backendUrl}{dots}</Text>
          </Box>
        )}
        {ready && loading && (
          <Box marginTop={1}>
            <Text color={T.accent}>Authenticating{dots}</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text color={T.dim}>
            {ready
              ? '[tab] switch field  [enter] next/login'
              : '[tab] switch field  -  login opens once the backend answers'}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Read the logo once, and only when it fits the terminal whole - a wrapped
 * copy of the art is worse than no art.
 */
function useLogo(columns: number | undefined): string[] {
  const [logo] = useState<string[]>(() => (logoFits(columns) ? loadLogo() : []));
  return logo;
}

/**
 * The console starts alongside the servers and regularly wins the race, so
 * poll until the backend answers rather than letting a sysop type a password
 * into a socket that is not listening yet.
 */
function useBackendReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    let timer: NodeJS.Timeout;
    const tick = async () => {
      const up = await probeBackend();
      if (!live) return;
      if (up) { setReady(true); return; }
      timer = setTimeout(tick, 1000);
    };
    void tick();
    return () => { live = false; clearTimeout(timer); };
  }, []);
  return ready;
}

function useDots(): string {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 250);
    return () => clearInterval(id);
  }, []);
  return dots;
}
