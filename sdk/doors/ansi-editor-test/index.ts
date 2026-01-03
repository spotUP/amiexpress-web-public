/**
 * ANSI Editor SDK Test Door
 * Simple test to verify basic ANSI editor functionality
 */

import { Door } from '@amiexpress/bbs-door-sdk/core';
import { showANSIEditor } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor';

export default class ANSIEditorTestDoor extends Door {
  async run(): Promise<void> {
    try {
      // Show welcome message
      this.session.writeLine('\r\n{cyan-fg}ANSI Editor SDK Test{/}\r\n');
      this.session.writeLine('This door tests the basic ANSI editor functionality.\r\n');
      this.session.writeLine('Press any key to open the editor...');
      await this.session.waitForKey();

      // Sample content with ANSI codes
      const sampleContent = [
        '{cyan-fg}Welcome to the ANSI Editor!{/}',
        '',
        'This is a {red-fg}test{/} of the {green-fg}ANSI{/} editor SDK.',
        '',
        '{yellow-fg}Features to test:{/}',
        '  * Basic text editing',
        '  * Cursor movement (arrows, Home/End, PgUp/PgDn)',
        '  * Insert/overwrite mode (Insert key)',
        '  * Line operations (Enter, Backspace, Delete)',
        '  * ANSI code preservation',
        '',
        '{cyan-fg}Keyboard shortcuts:{/}',
        '  * Arrow keys - Move cursor',
        '  * Home/End - Line start/end',
        '  * Ctrl+Home/End - Document start/end',
        '  * Ctrl+Left/Right - Word left/right',
        '  * Ctrl+D - Delete line',
        '  * Insert - Toggle insert/overwrite',
        '  * Ctrl+S - Save (test)',
        '  * ESC - Exit',
        '  * F1 - Help',
        '',
        'Try editing this text!',
      ].join('\n');

      // Show editor
      const result = await showANSIEditor(this.session, {
        title: 'ANSI Editor Test',
        initialContent: sampleContent,
        showLineNumbers: true,
        maxLines: 1000,
        maxLineLength: 200,
        onSave: async (content: string) => {
          // Test save callback
          this.session.writeLine('\r\n{green-fg}[TEST] Save callback triggered!{/}\r\n');
          this.session.writeLine(`Content length: ${content.length} characters\r\n`);
          this.session.writeLine(`Lines: ${content.split('\n').length}\r\n`);
          return true; // Indicate save successful
        },
      });

      // Show results
      this.session.writeLine('\r\n{cyan-fg}Editor Results:{/}\r\n');

      if (result === null) {
        this.session.writeLine('{yellow-fg}Editor was cancelled (ESC pressed){/}\r\n');
      } else {
        this.session.writeLine('{green-fg}Editor returned content:{/}\r\n');
        this.session.writeLine('---\r\n');

        // Show first 10 lines of result
        const lines = result.split('\n');
        const displayLines = lines.slice(0, 10);
        for (const line of displayLines) {
          this.session.writeLine(line + '\r\n');
        }

        if (lines.length > 10) {
          this.session.writeLine(`... (${lines.length - 10} more lines)\r\n`);
        }

        this.session.writeLine('---\r\n');
        this.session.writeLine(`Total: ${lines.length} lines, ${result.length} characters\r\n`);
      }

      this.session.writeLine('\r\n{cyan-fg}Test complete!{/}\r\n');
      this.session.writeLine('Press any key to exit...');
      await this.session.waitForKey();

    } catch (error) {
      this.session.writeLine(`\r\n{red-fg}ERROR:{/} ${error}\r\n`);
      this.session.writeLine('Press any key to exit...');
      await this.session.waitForKey();
    }
  }
}
