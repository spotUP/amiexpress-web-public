import type { EventPrefs } from '../types';
/** Default event preferences */
export declare function getDefaultPrefs(): EventPrefs;
/** Parse DB row to EventPrefs */
export declare function rowToPrefs(row: any): EventPrefs;
