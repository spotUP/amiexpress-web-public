/**
 * Font Alignment Test Door
 * Tests vertical alignment between Unicode and Amiga fonts
 */

import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import type { DoorContext } from '@amiexpress/bbs-door-sdk';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

const door = new Door({
  name: 'Font Alignment Test',
  version: '1.0.0',
  author: 'AmiExpress'
});

door.onStart(async (ctx: DoorContext) => {
  const screen = (ctx as any).bbsSession?.screen;
  // Create main container
  const container = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%-3',
    style: {
      fg: 'white',
      bg: 'black'
    },
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: true,
    mouse: true
  });

  // Title
  blessed.box({
    parent: container,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: '{cyan-fg}{bold}FONT ALIGNMENT TEST{/bold}{/cyan-fg}',
    style: { fg: 'cyan' }
  });

  blessed.box({
    parent: container,
    top: 1,
    left: 0,
    width: '100%',
    height: 1,
    content: '{blue-fg}' + '='.repeat(80) + '{/blue-fg}'
  });

  // Test 1: Unicode blocks next to text
  let line = 3;
  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '{yellow-fg}Test 1: Unicode blocks + Text (should align vertically){/yellow-fg}'
  });

  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '█ Full block + Text ABC123'
  });

  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '▓ Dark shade + Text ABC123'
  });

  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '▒ Medium shade + Text ABC123'
  });

  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '░ Light shade + Text ABC123'
  });

  line++;

  // Test 2: Box drawing characters
  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '{yellow-fg}Test 2: Box drawing (Unicode) + Text{/yellow-fg}'
  });

  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '┌────────┐ Text should align with box'
  });

  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '│ Unicode │ Box and text vertical center'
  });

  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '└────────┘ Should be aligned'
  });

  line++;

  // Test 3: Mixed characters
  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '{yellow-fg}Test 3: Mixed line - Unicode blocks + letters + numbers{/yellow-fg}'
  });

  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '█▓▒░ ABC abc 123 !@# █▓▒░'
  });

  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '████ AMIGA ████ fonts ████ test ████'
  });

  line++;

  // Test 4: Baseline test
  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '{yellow-fg}Test 4: Baseline alignment test{/yellow-fg}'
  });

  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '█ g y p q j █ (letters with descenders)'
  });

  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '█ A B C D E █ (letters without descenders)'
  });

  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '█ 1 2 3 4 5 █ (numbers)'
  });

  line++;

  // Test 5: Full width test
  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '{yellow-fg}Test 5: Full width alternating pattern{/yellow-fg}'
  });

  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '█ A █ B █ C █ D █ E █ F █ G █ H █ I █ J █ K █ L █ M █ N █ O █ P █'
  });

  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '▓░▓░▓░▓░▓░▓░▓░ AmiExpress BBS Font Test ▓░▓░▓░▓░▓░▓░▓░'
  });

  line++;

  // Instructions
  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '{blue-fg}' + '='.repeat(80) + '{/blue-fg}'
  });

  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '{green-fg}Instructions:{/green-fg} Check if Unicode blocks and text align vertically.'
  });

  blessed.box({
    parent: container,
    top: line++,
    left: 0,
    width: '100%',
    height: 1,
    content: '{green-fg}Expected:{/green-fg} All characters should share the same baseline/centerline.'
  });

  // Footer with instructions
  const footer = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    style: {
      fg: 'white',
      bg: 'blue'
    }
  });

  blessed.text({
    parent: footer,
    top: 0,
    left: 2,
    content: '{bold}Font Alignment Test v1.0{/bold}'
  });

  blessed.text({
    parent: footer,
    top: 1,
    left: 2,
    content: 'Use {bold}UP/DOWN{/bold} arrows or {bold}PgUp/PgDn{/bold} to scroll. Press {bold}Q{/bold} or {bold}ESC{/bold} to quit.'
  });

  // Key bindings
  screen.key(['escape', 'q', 'Q'], () => {
    ctx.output.writeLine('\r\n');
    process.exit(0);
  });

  screen.key(['up', 'down', 'pageup', 'pagedown'], (_ch: any, key: any) => {
    if (key.name === 'up') {
      container.scroll(-1);
    } else if (key.name === 'down') {
      container.scroll(1);
    } else if (key.name === 'pageup') {
      container.scroll(-10);
    } else if (key.name === 'pagedown') {
      container.scroll(10);
    }
    screen.render();
  });

  screen.render();
});

export default door;
