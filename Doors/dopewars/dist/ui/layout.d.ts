import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createScreen } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
export interface Layout {
    screen: ReturnType<typeof createScreen>;
    header: ReturnType<typeof blessed.box>;
    market: ReturnType<typeof blessed.box>;
    inventory: ReturnType<typeof blessed.box>;
    events: ReturnType<typeof blessed.box>;
    players: ReturnType<typeof blessed.box>;
    actions: ReturnType<typeof blessed.box>;
}
export declare function createLayout(session: any): Layout;
//# sourceMappingURL=layout.d.ts.map