/**
 * Training mode level selector dialog
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { type PracticeGoal } from '../core/practice-goal';
export interface TrainingConfig {
    startLevel: number;
    /** What ends the run (HeborisCE p_goaltype). 'none' plays until a top-out. */
    goal: PracticeGoal;
}
export declare function showTrainingConfig(screen: Screen): Promise<TrainingConfig>;
//# sourceMappingURL=training-config.d.ts.map