import React, { useState } from 'react';
import { render } from 'ink';
import { App } from './App.js';
import { LoginPrompt } from './components/LoginPrompt.js';
import { SplashScreen } from './components/SplashScreen.js';
import { useAuth } from './hooks/useAuth.js';

process.stdout.write('\x1b[?1049h\x1b[H');
const exitAltScreen = () => { process.stdout.write('\x1b[?1049l'); };
process.on('exit', exitAltScreen);
process.on('SIGINT', () => { exitAltScreen(); process.exit(0); });
process.on('SIGTERM', () => { exitAltScreen(); process.exit(0); });

function Root() {
  const [showSplash, setShowSplash] = useState(true);
  const { token, username, error, loading, login } = useAuth();

  if (showSplash) {
    return <SplashScreen onDone={() => setShowSplash(false)} />;
  }

  if (!token) {
    return <LoginPrompt error={error} loading={loading} onLogin={login} />;
  }

  return <App username={username ?? 'sysop'} />;
}

const { waitUntilExit } = render(<Root />, {
  patchConsole: true,
});

await waitUntilExit();
process.exit(0);
