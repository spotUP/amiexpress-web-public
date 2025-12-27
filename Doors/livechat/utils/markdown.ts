/** Parse markdown formatting for blessed tags */
export function parseMarkdown(text: string): string {
  return text
    // Bold **text**
    .replace(/\*\*(.+?)\*\*/g, '{bold}$1{/bold}')
    // Italic *text*
    .replace(/\*(.+?)\*/g, '{italic}$1{/italic}')
    // Underline __text__
    .replace(/__(.+?)__/g, '{underline}$1{/underline}')
    // Inline code `code`
    .replace(/`([^`]+)`/g, '{inverse} $1 {/inverse}')
    // Strikethrough ~~text~~
    .replace(/~~(.+?)~~/g, '{gray-fg}$1{/gray-fg}');
}

/** Parse code blocks */
export function parseCodeBlock(text: string): string {
  return text.replace(/```([\s\S]*?)```/g, (_, code) => {
    const lines = code.trim().split('\n');
    return lines.map((l: string) => `{gray-bg}{white-fg} ${l} {/}`).join('\n');
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

/** Full markdown parsing */
export function parseContent(text: string): string {
  let result = text;
  result = parseCodeBlock(result);
  result = parseMarkdown(result);
  result = parseLinks(result);
  result = parseEmotes(result);
  return result;
}
