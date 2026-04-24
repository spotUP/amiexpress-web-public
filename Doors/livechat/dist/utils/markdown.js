"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseMarkdown = parseMarkdown;
exports.parseColors = parseColors;
exports.parseCodeBlock = parseCodeBlock;
exports.parseLinks = parseLinks;
exports.parseEmotes = parseEmotes;
exports.parseContent = parseContent;
// Valid blessed colors (16-color palette)
const VALID_COLORS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray'];
/** Parse markdown formatting for blessed tags */
function parseMarkdown(text) {
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
function parseColors(text) {
    // Foreground colors: {red}text{/red} -> {red-fg}text{/red-fg}
    // Use [^{]+ to prevent matching across multiple tags and causing bleed
    text = text.replace(/\{(\w+)\}([^{]+)\{\/\1\}/g, (match, color, content) => {
        if (VALID_COLORS.includes(color)) {
            return `{${color}-fg}${content}{/${color}-fg}`;
        }
        return match; // Keep original if not a valid color
    });
    // Background colors: {bg:blue}text{/bg} -> {blue-bg}text{/blue-bg}
    text = text.replace(/\{bg:(\w+)\}([^{]+)\{\/bg\}/g, (match, color, content) => {
        if (VALID_COLORS.includes(color)) {
            return `{${color}-bg}${content}{/${color}-bg}`;
        }
        return match; // Keep original if not a valid color
    });
    return text;
}
/** Parse code blocks */
function parseCodeBlock(text) {
    return text.replace(/```([\s\S]*?)```/g, (_, code) => {
        const lines = code.trim().split('\n');
        // Use specific closing tags to avoid resetting ALL attributes
        return lines.map((l) => `{gray-bg}{white-fg} ${l} {/white-fg}{/gray-bg}`).join('\n');
    });
}
/** Parse links [text](url) */
function parseLinks(text) {
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '{cyan-fg}[$1]{/cyan-fg}');
}
/** Parse emotes :name: */
function parseEmotes(text) {
    const emotes = {
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
// Recognised blessed tag names (the full set of colour tokens blessed
// understands). Braces that wrap one of these are preserved; other
// user-typed braces are escaped so they render literally.
const BLESSED_TAG_NAMES = new Set([
    'bold', 'underline', 'blink', 'inverse', 'invisible', 'italic',
    'open', 'close',
    'black-fg', 'red-fg', 'green-fg', 'yellow-fg', 'blue-fg', 'magenta-fg', 'cyan-fg', 'white-fg', 'gray-fg',
    'black-bg', 'red-bg', 'green-bg', 'yellow-bg', 'blue-bg', 'magenta-bg', 'cyan-bg', 'white-bg', 'gray-bg',
    'lightblack-fg', 'lightred-fg', 'lightgreen-fg', 'lightyellow-fg', 'lightblue-fg', 'lightmagenta-fg', 'lightcyan-fg', 'lightwhite-fg', 'lightgray-fg',
    'lightblack-bg', 'lightred-bg', 'lightgreen-bg', 'lightyellow-bg', 'lightblue-bg', 'lightmagenta-bg', 'lightcyan-bg', 'lightwhite-bg', 'lightgray-bg',
    'left', 'right', 'center',
]);
function isBlessedTag(name) {
    if (!name)
        return false;
    if (name.startsWith('/'))
        name = name.slice(1);
    return BLESSED_TAG_NAMES.has(name);
}
/** Full markdown parsing (excludes animations - those are parsed separately) */
function parseContent(text) {
    // Escape braces that DON'T belong to a recognised blessed tag. Previous
    // behaviour escaped every `{` / `}`, which broke callers passing
    // pre-formatted strings like `{magenta-fg}[DM to foo]{/magenta-fg}`
    // — the escape turned those into `{open}magenta-fg{close}…` and blessed
    // rendered the raw tags as text. Now only stray user-typed braces get
    // escaped.
    let result = text.replace(/\{([^{}]*)\}/g, (m, inner) => {
        return isBlessedTag(inner) ? m : `{open}${inner}{close}`;
    });
    // THEN: Parse our supported formatting which will inject its own tags
    result = parseCodeBlock(result);
    result = parseMarkdown(result);
    result = parseColors(result); // Color tags
    result = parseLinks(result);
    result = parseEmotes(result);
    // Note: Animation tags (~rainbow~, etc.) are not parsed here
    // They are handled by the AnimationManager to enable live rendering
    return result;
}
