/**
 * DoorLoader Example
 *
 * Demonstrates how to use the DoorLoader utility to show loading progress
 * for TypeScript doors that need to initialize assets, data, or resources.
 *
 * Usage:
 *   npx tsx sdk/examples/door-loader-example.ts
 */

import blessed from '../engines/ui/blessed';
import { DoorLoader } from '../utils/DoorLoader';

// Simulate a door session (in real door this comes from SDK)
const mockBbs = {
  write: (data: string) => process.stdout.write(data),
};

async function main() {
  // Create screen
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: 'DoorLoader Example',
    output: (data: string) => mockBbs.write(data),
  });

  // Create main content box
  const contentBox = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '80%',
    height: '80%',
    border: { type: 'line' },
    label: ' Game ',
    tags: true,
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'green' },
    },
    content: '{center}Press Q to quit{/center}\n\n' +
              '{center}Loading complete! Game ready to play.{/center}',
  });

  // Create loader (will overlay on top)
  const loader = new DoorLoader(screen, {
    overlay: true,         // Show semi-transparent overlay
    overlayOpacity: 0.5,   // 50% opacity
    barColor: 'cyan',      // Cyan progress bar
  });

  // Show loader immediately
  loader.show('Initializing...');
  screen.render();

  // Simulate loading sequence
  await simulateLoading(loader);

  // Hide loader when done
  loader.hide();
  screen.render();

  // Cleanup
  screen.key(['q', 'Q', 'C-c'], () => {
    loader.destroy();
    screen.destroy();
    process.exit(0);
  });

  screen.render();
}

/**
 * Simulate a realistic door loading sequence
 */
async function simulateLoading(loader: DoorLoader) {
  // Phase 1: Load configuration
  loader.update(10, 'Loading configuration...');
  await delay(800);

  // Phase 2: Load sprite assets
  loader.update(25, 'Loading sprites...');
  await delay(1200);

  // Phase 3: Load sound effects
  loader.update(50, 'Loading sound effects...');
  await delay(1000);

  // Phase 4: Load music
  loader.update(65, 'Loading music tracks...');
  await delay(900);

  // Phase 5: Load level data
  loader.update(80, 'Loading level data...');
  await delay(1100);

  // Phase 6: Initialize game engine
  loader.update(90, 'Initializing game engine...');
  await delay(700);

  // Phase 7: Final setup
  loader.update(95, 'Final setup...');
  await delay(500);

  // Done!
  loader.update(100, 'Ready!');
  await loader.delay(800);  // Show "Ready!" briefly before hiding
}

/**
 * Helper delay function
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the example
main().catch(console.error);
