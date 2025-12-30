// Valid blessed colors (16-color palette)
const VALID_COLORS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray'];

/** Parse markdown formatting for blessed tags */
export function parseMarkdown(text: string): string {
  return text
    // Bold **text**
    .replace(/\*\*(.+?)\*\*/g, '{bold}$1{/bold}')
    // Italic *text*
    .replace(/\*(.+?)\*/g, '{italic}$1{/italic}')
    // Underline __text__
    .replace(/__(.+?)__/g, '{underline}$1{/underline}')
    // Inline code `code` - use inverse for contrast without setting bg
    .replace(/`([^`]+)`/g, '{inverse} $1 {/inverse}')
    // Strikethrough ~~text~~
    .replace(/~~(.+?)~~/g, '{gray-fg}$1{/gray-fg}');
}

/** Parse color tags {color}text{/color} and {bg:color}text{/bg} */
export function parseColors(text: string): string {
  // Foreground colors: {red}text{/red} -> {red-fg}text{/red-fg}
  text = text.replace(/\{(\w+)\}(.+?)\{\/\1\}/g, (match, color, content) => {
    if (VALID_COLORS.includes(color)) {
      return `{${color}-fg}${content}{/${color}-fg}`;
    }
    return match; // Keep original if not a valid color
  });

  // Background colors: {bg:blue}text{/bg} -> {blue-bg}text{/blue-bg}
  text = text.replace(/\{bg:(\w+)\}(.+?)\{\/bg\}/g, (match, color, content) => {
    if (VALID_COLORS.includes(color)) {
      return `{${color}-bg}${content}{/${color}-bg}`;
    }
    return match; // Keep original if not a valid color
  });

  return text;
}

/** Parse code blocks */
export function parseCodeBlock(text: string): string {
  return text.replace(/```([\s\S]*?)```/g, (_, code) => {
    const lines = code.trim().split('\n');
    // Use specific closing tags to avoid resetting ALL attributes
    return lines.map((l: string) => `{gray-bg}{white-fg} ${l} {/white-fg}{/gray-bg}`).join('\n');
  });
}

/** Parse links [text](url) */
export function parseLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '{cyan-fg}[$1]{/cyan-fg}');
}

/** Parse emotes :name: */
export function parseEmotes(text: string): string {
  const emotes: Record<string, string> = {
    ':)': ':)',
    ':(': ':(',
    ':D': ':D',
    ':P': ':P',
    '<3': '<3',
    ':thumbsup:': '[+]',
    ':thumbsdown:': '[-]',
    ':fire:': '*F*',
    ':heart:': '<3'
  };
  for (const [code, display] of Object.entries(emotes)) {
    text = text.split(code).join(display);
  }
  return text;
}

/** Full markdown parsing (excludes animations - those are parsed separately) */
export function parseContent(text: string): string {
  let result = text;
  result = parseCodeBlock(result);
  result = parseMarkdown(result);
  result = parseColors(result);  // Color tags
  result = parseLinks(result);
  result = parseEmotes(result);
  // Note: Animation tags (~rainbow~, etc.) are not parsed here
  // They are handled by the AnimationManager to enable live rendering
  return result;
}
