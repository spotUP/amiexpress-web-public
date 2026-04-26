/**
 * Training mode level selector dialog
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
export interface TrainingConfig {
    startLevel: number;
}
export declare function showTrainingConfig(screen: Screen): Promise<TrainingConfig>;
//# sourceMappingURL=training-config.d.ts.map