/**
 * BBS Frontend - Terminal Component
 *
 * This is a re-export of the shared BBS Terminal component from @amiexpress/terminal.
 * Both the BBS frontend and SDK preview use the EXACT same component for 100% compatibility.
 */

import { BBSTerminal, type BBSTerminalRef } from '@amiexpress/terminal';

// Re-export with default export for backwards compatibility
export default BBSTerminal;

// Named exports
export { BBSTerminal, BBSTerminal as Terminal, type BBSTerminalRef };
