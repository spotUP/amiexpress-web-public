/**
 * Help screen overlay - uses DocModal widget from SDK
 */
import { Screen, Textarea, DocModal } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { HELP_PART_1 } from './help-content-1';
import { HELP_PART_2 } from './help-content-2';
import { HELP_PART_3 } from './help-content-3';
import { HELP_PART_4 } from './help-content-4';

export function createHelpScreen(
  screen: Screen,
  inputBox: Textarea
): () => void {
  const helpModal = new DocModal({
    parent: screen,
    title: 'LiveChat v3.2 Help',
    header: 'HELP',
    content: HELP_PART_1 + HELP_PART_2 + HELP_PART_3 + HELP_PART_4,
    headerStyle: { fg: 'cyan' },
    contentStyle: { fg: 'white' },
    footerStyle: { fg: 'black', bg: 'cyan' },
    zIndex: 9990,
    onClose: () => {
      inputBox.focus();
      screen.render();
    },
  });

  return function showHelp() {
    helpModal.display(inputBox);
  };
}
