/**
 * ANSI Editor SDK - State-of-the-art ANSI/ASCII art editor
 * Complete Moebius feature parity with modern enhancements
 *
 * Features:
 * - Full drawing toolset (draw, line, box, ellipse, fill, text, pick, select, shifter)
 * - Mouse and keyboard input support
 * - Undo/redo system with chunked operations
 * - Selection and clipboard (copy, cut, paste, transform)
 * - Neo-Blessed modal dialogs for professional UI
 * - Multiple file format support (ANS, ASC, BIN, XB, TXT)
 * - iCE colors support (16 background colors + blink)
 * - Guides and grid overlays
 * - Color picker with full palette
 * - Real-time canvas rendering
 */
import { Door } from '@amiexpress/bbs-door-sdk';
declare const door: Door;
export default door;
export declare function runDoor(session: any): Promise<void>;
