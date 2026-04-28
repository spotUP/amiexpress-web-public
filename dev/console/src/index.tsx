import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import { LoginPrompt } from './components/LoginPrompt.js';
import { useAuth } from './hooks/useAuth.js';

function Root() {
  const { token, username, error, loading, login } = useAuth();

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
