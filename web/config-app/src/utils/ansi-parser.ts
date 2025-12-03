/**
 * ANSI Parser for Session Logs
 *
 * Parses ANSI escape sequences and:
 * - Converts color codes to HTML spans with CSS
 * - Replaces cursor positioning and screen control codes with descriptive placeholders
 */

interface AnsiColor {
  fg?: string;
  bg?: string;
  bold?: boolean;
}

const ANSI_COLORS: Record<number, string> = {
  30: '#000000', // Black
  31: '#AA0000', // Red
  32: '#00AA00', // Green
  33: '#AA5500', // Yellow
  34: '#0000AA', // Blue
  35: '#AA00AA', // Magenta
  36: '#00AAAA', // Cyan
  37: '#AAAAAA', // White
  90: '#555555', // Bright Black (Gray)
  91: '#FF5555', // Bright Red
  92: '#55FF55', // Bright Green
  93: '#FFFF55', // Bright Yellow
  94: '#5555FF', // Bright Blue
  95: '#FF55FF', // Bright Magenta
  96: '#55FFFF', // Bright Cyan
  97: '#FFFFFF', // Bright White
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: '#000000', // Black
  41: '#AA0000', // Red
  42: '#00AA00', // Green
  43: '#AA5500', // Yellow
  44: '#0000AA', // Blue
  45: '#AA00AA', // Magenta
  46: '#00AAAA', // Cyan
  47: '#AAAAAA', // White
  100: '#555555', // Bright Black
  101: '#FF5555', // Bright Red
  102: '#55FF55', // Bright Green
  103: '#FFFF55', // Bright Yellow
  104: '#5555FF', // Bright Blue
  105: '#FF55FF', // Bright Magenta
  106: '#55FFFF', // Bright Cyan
  107: '#FFFFFF', // Bright White
};

/**
 * Parse ANSI codes and convert to HTML with color support and cursor code placeholders
 */
export function parseAnsiToHtml(text: string): string {
  let html = '';
  let currentColor: AnsiColor = {};
  let i = 0;

  // Escape HTML characters
  const escapeHtml = (str: string) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Generate style string from current color state
  const getStyle = (color: AnsiColor) => {
    const styles: string[] = [];
    if (color.fg) styles.push(`color: ${color.fg}`);
    if (color.bg) styles.push(`background-color: ${color.bg}`);
    if (color.bold) styles.push(`font-weight: bold`);
    return styles.join('; ');
  };

  // Close any open span
  const closeSpan = () => {
    if (currentColor.fg || currentColor.bg || currentColor.bold) {
      html += '</span>';
    }
  };

  // Open new span with current color
  const openSpan = () => {
    const style = getStyle(currentColor);
    if (style) {
      html += `<span style="${style}">`;
    }
  };

  while (i < text.length) {
    // Look for ESC character (0x1B)
    if (text[i] === '\x1b' && text[i + 1] === '[') {
      // Found ANSI escape sequence
      let j = i + 2;
      let code = '';

      // Read until we find the command letter
      while (j < text.length && /[0-9;?]/.test(text[j])) {
        code += text[j];
        j++;
      }

      const command = text[j];
      const params = code.split(';').map(p => parseInt(p) || 0);

      // Handle different ANSI commands
      if (command === 'm') {
        // SGR (Select Graphic Rendition) - Color codes
        closeSpan();

        if (params.length === 0 || params[0] === 0) {
          // Reset
          currentColor = {};
        } else {
          for (const param of params) {
            if (param === 0) {
              // Reset
              currentColor = {};
            } else if (param === 1) {
              // Bold
              currentColor.bold = true;
            } else if (param === 22) {
              // Normal intensity
              currentColor.bold = false;
            } else if (param >= 30 && param <= 37) {
              // Foreground color
              currentColor.fg = ANSI_COLORS[param];
            } else if (param >= 40 && param <= 47) {
              // Background color
              currentColor.bg = ANSI_BG_COLORS[param];
            } else if (param >= 90 && param <= 97) {
              // Bright foreground color
              currentColor.fg = ANSI_COLORS[param];
            } else if (param >= 100 && param <= 107) {
              // Bright background color
              currentColor.bg = ANSI_BG_COLORS[param];
            }
          }
        }

        openSpan();
      } else {
        // Non-color codes - replace with placeholders
        closeSpan();

        let placeholder = '';

        switch (command) {
          case 'H':
          case 'f':
            // Cursor position
            const row = params[0] || 1;
            const col = params[1] || 1;
            placeholder = `<span class="ansi-placeholder" style="color: #888; background: #222; padding: 2px 4px; margin: 0 2px; border-radius: 2px;">[GOTO ${row},${col}]</span>`;
            break;
          case 'A':
            // Cursor up
            placeholder = `<span class="ansi-placeholder" style="color: #888; background: #222; padding: 2px 4px; margin: 0 2px; border-radius: 2px;">[UP ${params[0] || 1}]</span>`;
            break;
          case 'B':
            // Cursor down
            placeholder = `<span class="ansi-placeholder" style="color: #888; background: #222; padding: 2px 4px; margin: 0 2px; border-radius: 2px;">[DOWN ${params[0] || 1}]</span>`;
            break;
          case 'C':
            // Cursor forward
            placeholder = `<span class="ansi-placeholder" style="color: #888; background: #222; padding: 2px 4px; margin: 0 2px; border-radius: 2px;">[RIGHT ${params[0] || 1}]</span>`;
            break;
          case 'D':
            // Cursor back
            placeholder = `<span class="ansi-placeholder" style="color: #888; background: #222; padding: 2px 4px; margin: 0 2px; border-radius: 2px;">[LEFT ${params[0] || 1}]</span>`;
            break;
          case 'J':
            // Erase display
            if (params[0] === 2) {
              placeholder = `<span class="ansi-placeholder" style="color: #888; background: #222; padding: 2px 4px; margin: 0 2px; border-radius: 2px;">[CLEAR SCREEN]</span>`;
            } else if (params[0] === 0) {
              placeholder = `<span class="ansi-placeholder" style="color: #888; background: #222; padding: 2px 4px; margin: 0 2px; border-radius: 2px;">[CLEAR TO END]</span>`;
            } else if (params[0] === 1) {
              placeholder = `<span class="ansi-placeholder" style="color: #888; background: #222; padding: 2px 4px; margin: 0 2px; border-radius: 2px;">[CLEAR TO START]</span>`;
            } else {
              placeholder = `<span class="ansi-placeholder" style="color: #888; background: #222; padding: 2px 4px; margin: 0 2px; border-radius: 2px;">[CLEAR ${params[0]}]</span>`;
            }
            break;
          case 'K':
            // Erase line
            if (params[0] === 2) {
              placeholder = `<span class="ansi-placeholder" style="color: #888; background: #222; padding: 2px 4px; margin: 0 2px; border-radius: 2px;">[CLEAR LINE]</span>`;
            } else if (params[0] === 0) {
              placeholder = `<span class="ansi-placeholder" style="color: #888; background: #222; padding: 2px 4px; margin: 0 2px; border-radius: 2px;">[CLEAR LINE TO END]</span>`;
            } else if (params[0] === 1) {
              placeholder = `<span class="ansi-placeholder" style="color: #888; background: #222; padding: 2px 4px; margin: 0 2px; border-radius: 2px;">[CLEAR LINE TO START]</span>`;
            } else {
              placeholder = `<span class="ansi-placeholder" style="color: #888; background: #222; padding: 2px 4px; margin: 0 2px; border-radius: 2px;">[CLEAR LINE ${params[0]}]</span>`;
            }
            break;
          case 's':
            // Save cursor position
            placeholder = `<span class="ansi-placeholder" style="color: #888; background: #222; padding: 2px 4px; margin: 0 2px; border-radius: 2px;">[SAVE CURSOR]</span>`;
            break;
          case 'u':
            // Restore cursor position
            placeholder = `<span class="ansi-placeholder" style="color: #888; background: #222; padding: 2px 4px; margin: 0 2px; border-radius: 2px;">[RESTORE CURSOR]</span>`;
            break;
          case 'h':
            // Set mode
            placeholder = `<span class="ansi-placeholder" style="color: #888; background: #222; padding: 2px 4px; margin: 0 2px; border-radius: 2px;">[SET MODE ${code}]</span>`;
            break;
          case 'l':
            // Reset mode
            placeholder = `<span class="ansi-placeholder" style="color: #888; background: #222; padding: 2px 4px; margin: 0 2px; border-radius: 2px;">[RESET MODE ${code}]</span>`;
            break;
          default:
            // Unknown command - show raw
            placeholder = `<span class="ansi-placeholder" style="color: #888; background: #222; padding: 2px 4px; margin: 0 2px; border-radius: 2px;">[ESC[${code}${command}]</span>`;
        }

        html += placeholder;
        openSpan();
      }

      i = j + 1;
    } else {
      // Regular character - add to output
      html += escapeHtml(text[i]);
      i++;
    }
  }

  // Close any remaining span
  closeSpan();

  return html;
}

/**
 * Strip all ANSI escape codes from text
 * Returns plain text without any ANSI formatting
 */
export function stripAnsiCodes(text: string): string {
  // Remove all ANSI escape sequences
  // Matches: ESC [ ... (any letter or @)
  return text.replace(/\x1b\[[0-9;]*[A-Za-z@]/g, '');
}
