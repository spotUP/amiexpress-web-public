/**
 * Help screen overlay
 */
import blessed, { Screen, Textbox } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { HELP_PART_1 } from './help-content-1';
import { HELP_PART_2 } from './help-content-2';
import { HELP_PART_3 } from './help-content-3';

export function createHelpScreen(
  screen: Screen,
  inputBox: Textbox
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
    focusable: true,
    ch: ' ',
    scrollbar: { ch: ' ' },
    style: { fg: 'white', bg: 'black' },
    content: HELP_PART_1 + HELP_PART_2 + HELP_PART_3,
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

  helpContent.key(['escape', 'f1'], () => {
    helpOverlay.hide();
    inputBox.focus();
    screen.render();
  });

  return function showHelp() {
    helpOverlay.show();
    helpOverlay.setFront();
    helpContent.focus();
    screen.render();
  };
}
