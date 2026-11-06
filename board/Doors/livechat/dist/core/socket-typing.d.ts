import type { AppState } from './state';
import type { BBSEvent } from '../types';
/** Check if event should be shown based on user preferences */
export declare function shouldShowEvent(event: BBSEvent, prefs: AppState['prefs']): boolean;
