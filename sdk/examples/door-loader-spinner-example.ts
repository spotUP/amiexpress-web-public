/**
 * DoorLoader Spinner Example
 *
 * Demonstrates using DoorLoader with spinner mode for indeterminate loading
 * (when you don't know exact progress percentage).
 *
 * Usage:
 *   npx tsx sdk/examples/door-loader-spinner-example.ts
 */

import blessed from '../engines/ui/blessed';
import { DoorLoader } from '../utils/DoorLoader';

const mockBbs = {
  write: (data: string) => process.stdout.write(data),
};

async function main() {
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: 'DoorLoader Spinner Example',
    output: (data: string) => mockBbs.write(data),
  });

  const contentBox = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '80%',
    height: '80%',
    border: { type: 'line' },
    label: ' Connection Test ',
    tags: true,
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'cyan' },
    },
    content: '{center}Press Q to quit{/center}\n\n' +
              '{center}Connected successfully!{/center}',
  });

  // Create loader with spinner for indeterminate loading
  const loader = new DoorLoader(screen, {
    overlay: true,
    overlayOpacity: 0.6,
    barColor: 'green',
    spinner: true,                              // Enable spinner
    spinnerFrames: ['|', '/', '-', '\\'],       // ASCII spinner
    spinnerInterval: 80,                        // 80ms per frame
  });

  // Show spinner without progress (indeterminate)
  loader.show('Connecting to server...');
  screen.render();
  await delay(2000);

  // Update message while spinning
  loader.setMessage('Authenticating...');
  await delay(2000);

  loader.setMessage('Fetching user data...');
  await delay(1500);

  // Switch to determinate progress bar
  loader.update(30, 'Downloading game data...');
  await delay(1000);

  loader.update(60, 'Loading assets...');
  await delay(1000);

  loader.update(90, 'Finalizing...');
  await delay(800);

  loader.update(100, 'Connected!');
  await loader.delay(800);

  // Hide loader
  loader.hide();
  screen.render();

  // Cleanup
  screen.key(['q', 'Q', 'C-c'], () => {
    loader.destroy();
    screen.destroy();
    process.exit(0);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
