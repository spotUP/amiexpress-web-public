/**
 * Help screen overlay
 */
import blessed, { Screen, Textarea } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { HELP_PART_1 } from './help-content-1';
import { HELP_PART_2 } from './help-content-2';
import { HELP_PART_3 } from './help-content-3';
import { HELP_PART_4 } from './help-content-4';

export function createHelpScreen(
  screen: Screen,
  inputBox: Textarea
): () => void {
  const helpOverlay = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    label: ' LiveChat v3.2 Help ',
    border: { type: 'line' },
    shadow: false,
    hidden: true,
    mouse: true,
    keys: true,
    closable: true,  // Adds [X] button and ESC key binding
    ch: ' ',
    style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
  });

  blessed.bigtext({
    parent: helpOverlay,
    top: 0,
    left: 'center',
    width: 'shrink',
    height: 'shrink',
    content: 'HELP',
    font: 'simple',
    ch: ' ',
    style: { fg: 'cyan', bg: 'black' },
  });

  const helpContent = blessed.scrollabletext({
    parent: helpOverlay,
    top: 3,
    left: 1,
    width: '100%-4',
    height: '100%-6',
    tags: true,
    mouse: true,
    scrollable: true,
    alwaysScroll: true,
    focusable: true,
    ch: ' ',
    scrollbar: {
      ch: '█',
      style: { fg: 'cyan' }
    },
    style: { fg: 'white', bg: 'black' },
    content: HELP_PART_1 + HELP_PART_2 + HELP_PART_3 + HELP_PART_4,
  });

  blessed.box({
    parent: helpOverlay,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: { fg: 'black', bg: 'cyan' },
    content: ' {bold}Scroll: Mouse/PageUp/PageDown | Close: Escape/F1{/bold} ',
  });

  helpContent.on('wheelup', () => {
    helpContent.scroll(-3);
    screen.render();
  });

  helpContent.on('wheeldown', () => {
    helpContent.scroll(3);
    screen.render();
  });

  // F1 also closes help
  helpContent.key(['f1'], () => {
    helpOverlay.close();
  });

  // When closed (via X button, ESC, or F1), focus input
  helpOverlay.on('close', () => {
    helpOverlay.hide();
    inputBox.focus();
    screen.render();
  });

  // Add explicit escape key handler to ensure it works
  helpOverlay.key(['escape'], () => {
    helpOverlay.hide();
    inputBox.focus();
    screen.render();
  });

  return function showHelp() {
    // Update dimensions to current screen size (percentage widths only calculated at construction)
    helpOverlay.position.width = screen.width;
    helpOverlay.position.height = screen.height;
    helpOverlay.position.top = 0;
    helpOverlay.position.left = 0;

    // Invalidate coordinate cache for this element and all children
    // Required because we modified position directly instead of using setters
    const invalidateCache = (element: any) => {
      element._coordsCacheValid = false;
      if (element.children) {
        for (const child of element.children) {
          invalidateCache(child);
        }
      }
    };
    invalidateCache(helpOverlay);

    helpOverlay.show();
    helpOverlay.setFront();
    helpContent.focus();
    screen.render();
  };
}
