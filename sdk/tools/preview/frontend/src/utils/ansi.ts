import * as AnsiToHtmlModule from 'ansi-to-html';

// Handle both ESM and CommonJS exports
const AnsiToHtml = (AnsiToHtmlModule as any).default || AnsiToHtmlModule;

// Create ANSI to HTML converter with custom options
const converter = new AnsiToHtml({
  fg: '#CCCCCC',
  bg: '#1E1E1E',
  newline: true,
  escapeXML: true,
  stream: false,
});

/**
 * Convert ANSI escape codes to HTML
 */
export function ansiToHtml(text: string): string {
  return converter.toHtml(text);
}

/**
 * Strip ANSI escape codes from text
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Parse ANSI text into styled segments
 */
export interface AnsiSegment {
  text: string;
  style: {
    color?: string;
    backgroundColor?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
  };
}

export function parseAnsiSegments(text: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let currentStyle: AnsiSegment['style'] = {};
  let currentText = '';

  // eslint-disable-next-line no-control-regex
  const ansiRegex = /\x1B\[([0-9;]*)m/g;
  let lastIndex = 0;
  let match;

  while ((match = ansiRegex.exec(text)) !== null) {
    // Add text before this escape code
    if (match.index > lastIndex) {
      currentText += text.slice(lastIndex, match.index);
    }

    // If we have accumulated text, push it as a segment
    if (currentText) {
      segments.push({ text: currentText, style: { ...currentStyle } });
      currentText = '';
    }

    // Parse the escape code
    const codes = match[1].split(';').map(Number);
    for (const code of codes) {
      switch (code) {
        case 0: // Reset
          currentStyle = {};
          break;
        case 1: // Bold
          currentStyle.bold = true;
          break;
        case 3: // Italic
          currentStyle.italic = true;
          break;
        case 4: // Underline
          currentStyle.underline = true;
          break;
        case 30: // Black
          currentStyle.color = '#000000';
          break;
        case 31: // Red
          currentStyle.color = '#CD3131';
          break;
        case 32: // Green
          currentStyle.color = '#0DBC79';
          break;
        case 33: // Yellow
          currentStyle.color = '#E5E510';
          break;
        case 34: // Blue
          currentStyle.color = '#2472C8';
          break;
        case 35: // Magenta
          currentStyle.color = '#BC3FBC';
          break;
        case 36: // Cyan
          currentStyle.color = '#11A8CD';
          break;
        case 37: // White
          currentStyle.color = '#E5E5E5';
          break;
        case 40: // Black background
          currentStyle.backgroundColor = '#000000';
          break;
        case 41: // Red background
          currentStyle.backgroundColor = '#CD3131';
          break;
        case 42: // Green background
          currentStyle.backgroundColor = '#0DBC79';
          break;
        case 43: // Yellow background
          currentStyle.backgroundColor = '#E5E510';
          break;
        case 44: // Blue background
          currentStyle.backgroundColor = '#2472C8';
          break;
        case 45: // Magenta background
          currentStyle.backgroundColor = '#BC3FBC';
          break;
        case 46: // Cyan background
          currentStyle.backgroundColor = '#11A8CD';
          break;
        case 47: // White background
          currentStyle.backgroundColor = '#E5E5E5';
          break;
      }
    }

    lastIndex = ansiRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    currentText += text.slice(lastIndex);
  }
  if (currentText) {
    segments.push({ text: currentText, style: { ...currentStyle } });
  }

  return segments;
}

/**
 * Get text content from ANSI string (no HTML)
 */
export function getPlainText(ansiText: string): string {
  return stripAnsi(ansiText);
}
