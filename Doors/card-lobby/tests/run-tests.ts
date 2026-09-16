/**
 * Minimal test runner for the CARD LOBBY door.
 *
 * Same pattern as the arcade doors and the editors: dependency-free plain
 * async functions plus node assert, run via tsx (`npm test`). A test fails
 * by throwing.
 */

/* eslint-disable no-console */

const TEST_MODULES = ['./opens.test', './keys.test', './lobby.test', './theme.test', './dialogs.test',
  './uno-restore.test',
  './table-view-layout.test',
  './uno-deal-flow.test',
  './activity-panel.test',
  './menus.test',
  './card-style.test',
  './chat.test',
  './skitgubbe-engine.test',
  './skitgubbe-table.test',
  './a-long-hand-is-still-playable.test',
  './vandtia-engine.test',
  './vandtia-table.test',
  './a-card-is-a-thing-you-can-click.test',
  './the-instructions-do-not-scroll-away.test',
  './a-patience-is-a-text-file.test',
  './a-patience-plays-by-its-file.test',
  './a-solitaire-is-dealt-from-the-lobby.test',
  './a-panel-is-named-for-the-game-in-it.test',
  './a-row-of-cards-fans-when-it-must.test',
  './a-card-key-picks-then-plays.test',
  './a-key-reaches-the-door-once.test',
  './a-card-that-will-not-go-says-why.test',
  // LAST on purpose: it judges where every module above it wrote.
  './a-test-file-gets-its-own-lobby.test',
];

// The door logs freely on startup; keep the report readable.
const realLog = console.log;
console.log = () => {};

(async () => {
  let passed = 0;
  const failures: Array<{ name: string; error: unknown }> = [];

  for (const mod of TEST_MODULES) {
    const tests = await import(mod);
    for (const [name, fn] of Object.entries(tests)) {
      if (typeof fn !== 'function') continue;
      try {
        await (fn as () => Promise<void>)();
        passed++;
        realLog(`  [OK] ${mod.replace('./', '')} :: ${name}`);
      } catch (error) {
        failures.push({ name: `${mod} :: ${name}`, error });
        realLog(`  [FAIL] ${mod.replace('./', '')} :: ${name}`);
        realLog(`         ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  realLog(`\n${passed} passed, ${failures.length} failed`);
  process.exit(failures.length > 0 ? 1 : 0);
})().catch(e => {
  realLog('Test runner crashed:', e);
  process.exit(1);
});
