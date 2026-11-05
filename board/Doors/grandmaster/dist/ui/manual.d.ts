/**
 * Player Manual - GRANDMASTER Tetris
 *
 * Comprehensive guide with colored illustrations
 * Displayed in DocModal widget
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { DocModal } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
/**
 * Get the complete player manual content with colored illustrations
 */
export declare function getManualContent(): string;
/**
 * Show the manual in a DocModal
 */
export declare function showManual(screen: Screen, onClose?: () => void): DocModal;
//# sourceMappingURL=manual.d.ts.map