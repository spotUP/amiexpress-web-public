/**
 * GLC Viewer Door - Global Last Callers Viewer
 *
 * Displays global last callers from scenewall.bbs.io.
 * Ported from Amiga E version.
 *
 * Features:
 * - Display last callers across all BBSes
 * - Multiple ANSI art styles (4 styles)
 * - Yesterday and previous day statistics
 * - All-time records display
 * - Top 3 most called BBSes
 * - Configurable display options
 *
 * Original: dev/docs/AmiExpressEDoorSources/Global Last Callers/GLCViewer.e
 */
import { ServerDoor } from '@amiexpress/bbs-door-sdk';
export declare const metadata: {
    name: string;
    version: string;
    description: string;
    author: string;
    command: string;
};
/**
 * Main door class
 */
declare const door: ServerDoor;
export default door;
//# sourceMappingURL=index.d.ts.map