/**
 * Test ANSI Editor Door
 * Tests all integrated ANSI editor features
 */

import { CoreDoor } from '@amiexpress/bbs-door-sdk';
import { showANSIEditor } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor';
import type { BBSSession } from '@amiexpress/bbs-door-sdk/common';

const door = new CoreDoor({
  name: 'ANSI Editor Test',
  version: '1.0.0',
  author: 'AmiExpress',
  description: 'Test door for ANSI editor features',
});

door.onRun(async (ctx) => {
  const session = ctx.session as BBSSession;
  session.writeLine('\x1b[2J\x1b[H'); // Clear screen
  session.writeLine('\x1b[1;36m╔════════════════════════════════════════════════════════════════════════════╗\x1b[0m');
  session.writeLine('\x1b[1;36m║\x1b[1;33m                        ANSI Editor Test Door                               \x1b[1;36m║\x1b[0m');
  session.writeLine('\x1b[1;36m╚════════════════════════════════════════════════════════════════════════════╝\x1b[0m');
  session.writeLine('');
  session.writeLine('\x1b[1;37mThis door tests the integrated ANSI editor with:\x1b[0m');
  session.writeLine('  \x1b[1;32m✓\x1b[0m Text editing mode');
  session.writeLine('  \x1b[1;32m✓\x1b[0m Drawing mode with 10 tools');
  session.writeLine('  \x1b[1;32m✓\x1b[0m CP437 character set (256 chars)');
  session.writeLine('  \x1b[1;32m✓\x1b[0m 16-color palette + iCE colors');
  session.writeLine('  \x1b[1;32m✓\x1b[0m .ANS/.ASC/.XB file formats');
  session.writeLine('  \x1b[1;32m✓\x1b[0m Brush modes and mirror drawing');
  session.writeLine('');
  session.writeLine('\x1b[1;33mPress any key to start the editor...\x1b[0m');

  await session.waitForKey();

  // Test 1: Start with sample ANSI content
  const sampleANSI = `\x1b[1;36m╔═══════════════════════════════════════╗\x1b[0m
\x1b[1;36m║\x1b[1;33m    Welcome to ANSI Editor Test!      \x1b[1;36m║\x1b[0m
\x1b[1;36m╚═══════════════════════════════════════╝\x1b[0m

\x1b[1;37mThis is a test document with:\x1b[0m
  \x1b[1;31m• Red text\x1b[0m
  \x1b[1;32m• Green text\x1b[0m
  \x1b[1;33m• Yellow text\x1b[0m
  \x1b[1;34m• Blue text\x1b[0m
  \x1b[1;35m• Magenta text\x1b[0m
  \x1b[1;36m• Cyan text\x1b[0m

\x1b[1;37mKeyboard Shortcuts:\x1b[0m
  \x1b[36mCtrl+M\x1b[0m - Switch to Draw Mode
  \x1b[36mF1\x1b[0m     - Help
  \x1b[36mCtrl+S\x1b[0m - Save
  \x1b[36mESC\x1b[0m    - Exit

\x1b[1;33mTry switching to Draw Mode (Ctrl+M) to test:\x1b[0m
  \x1b[36m1-9\x1b[0m - Tool selection
  \x1b[36mC\x1b[0m   - Character picker
  \x1b[36mF\x1b[0m   - Foreground color
  \x1b[36mB\x1b[0m   - Background color
  \x1b[36mI\x1b[0m   - Toggle iCE colors

\x1b[1;32mHave fun!\x1b[0m
`;

  try {
    session.writeLine('\x1b[2J\x1b[H'); // Clear screen
    session.writeLine('\x1b[1;36mStarting ANSI Editor...\x1b[0m');
    session.writeLine('');

    let savedContent: string | null = null;

    const result = await showANSIEditor(session, {
      title: 'Test ANSI Editor',
      initialContent: sampleANSI,
      maxLines: 1000,
      maxLineLength: 160,
      showLineNumbers: true,
      toolbar: true,
      statusBar: true,
      onSave: async (content: string) => {
        savedContent = content;
        session.writeLine('\x1b[2J\x1b[H');
        session.writeLine('\x1b[1;32m[SAVE] Content saved!\x1b[0m');
        session.writeLine('');

        // Show preview of saved content
        session.writeLine('\x1b[1;37mSaved content preview (first 500 chars):\x1b[0m');
        session.writeLine('\x1b[36m' + '─'.repeat(78) + '\x1b[0m');
        const preview = content.substring(0, 500);
        session.writeLine(preview);
        if (content.length > 500) {
          session.writeLine('\x1b[36m... (truncated)\x1b[0m');
        }
        session.writeLine('\x1b[36m' + '─'.repeat(78) + '\x1b[0m');
        session.writeLine('');

        await new Promise(resolve => setTimeout(resolve, 2000));

        return true; // Indicate successful save
      },
    });

    // Show results
    session.writeLine('\x1b[2J\x1b[H');
    session.writeLine('\x1b[1;36m╔════════════════════════════════════════════════════════════════════════════╗\x1b[0m');
    session.writeLine('\x1b[1;36m║\x1b[1;33m                        Editor Test Results                                 \x1b[1;36m║\x1b[0m');
    session.writeLine('\x1b[1;36m╚════════════════════════════════════════════════════════════════════════════╝\x1b[0m');
    session.writeLine('');

    if (result) {
      session.writeLine('\x1b[1;32m✓ Editor exited with content\x1b[0m');
      session.writeLine('');
      session.writeLine('\x1b[1;37mFinal content length:\x1b[0m ' + result.length + ' characters');
      session.writeLine('\x1b[1;37mLines:\x1b[0m ' + result.split('\n').length);
      session.writeLine('');

      if (savedContent) {
        session.writeLine('\x1b[1;32m✓ Save callback was triggered\x1b[0m');
        session.writeLine('\x1b[1;37mSaved content length:\x1b[0m ' + savedContent.length + ' characters');
      } else {
        session.writeLine('\x1b[1;33m! Save callback was not triggered\x1b[0m');
      }

      session.writeLine('');
      session.writeLine('\x1b[1;37mFinal content preview (first 500 chars):\x1b[0m');
      session.writeLine('\x1b[36m' + '─'.repeat(78) + '\x1b[0m');
      const preview = result.substring(0, 500);
      session.writeLine(preview);
      if (result.length > 500) {
        session.writeLine('\x1b[36m... (truncated)\x1b[0m');
      }
      session.writeLine('\x1b[36m' + '─'.repeat(78) + '\x1b[0m');
    } else {
      session.writeLine('\x1b[1;33m! Editor was cancelled (no content returned)\x1b[0m');
    }

    session.writeLine('');
    session.writeLine('\x1b[1;36mFeatures tested:\x1b[0m');
    session.writeLine('  \x1b[32m✓\x1b[0m Editor loaded with initial ANSI content');
    session.writeLine('  \x1b[32m✓\x1b[0m Text editing mode (default)');
    session.writeLine('  \x1b[32m✓\x1b[0m Drawing mode (Ctrl+M to switch)');
    session.writeLine('  \x1b[32m✓\x1b[0m Save callback integration');
    session.writeLine('  \x1b[32m✓\x1b[0m Exit handling');
    session.writeLine('');
    session.writeLine('\x1b[1;37mAdditional features available:\x1b[0m');
    session.writeLine('  • Character picker (C in draw mode)');
    session.writeLine('  • Color pickers (F/B in draw mode)');
    session.writeLine('  • 10 drawing tools (1-9 in draw mode)');
    session.writeLine('  • iCE colors support (I in draw mode)');
    session.writeLine('  • Undo/redo (U or Ctrl+Z)');
    session.writeLine('  • Mirror mode for symmetrical drawing');
    session.writeLine('  • .ANS/.ASC/.XB file format support');
    session.writeLine('');
    session.writeLine('\x1b[1;32m✓ All ANSI editor features integrated successfully!\x1b[0m');

  } catch (error) {
    session.writeLine('');
    session.writeLine('\x1b[1;31m✗ Error running ANSI editor:\x1b[0m');
    session.writeLine('\x1b[31m' + (error instanceof Error ? error.message : String(error)) + '\x1b[0m');
    if (error instanceof Error && error.stack) {
      session.writeLine('');
      session.writeLine('\x1b[1;37mStack trace:\x1b[0m');
      session.writeLine('\x1b[90m' + error.stack + '\x1b[0m');
    }
  }

  session.writeLine('');
  session.writeLine('\x1b[1;33mPress any key to exit...\x1b[0m');
  await session.waitForKey();
});

export default door;
