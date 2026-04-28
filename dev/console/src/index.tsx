import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import { LoginPrompt } from './components/LoginPrompt.js';
import { useAuth } from './hooks/useAuth.js';

// Enter alternate screen buffer (like vim/less) so our TUI always starts at
// row 1 and prior shell output is restored on exit. Required so mouse-click
// row coordinates from xterm/tmux line up with the rendered layout.
process.stdout.write('\x1b[?1049h\x1b[H');
const exitAltScreen = () => { process.stdout.write('\x1b[?1049l'); };
process.on('exit', exitAltScreen);
process.on('SIGINT', () => { exitAltScreen(); process.exit(0); });
process.on('SIGTERM', () => { exitAltScreen(); process.exit(0); });

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
