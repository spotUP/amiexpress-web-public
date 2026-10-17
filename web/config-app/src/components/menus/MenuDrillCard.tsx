import type { MenuConfig } from '@bbs/screens/menu-config/menu-config';
import { setCoverFlowSlide } from './menu-edit';

interface Props { config: MenuConfig; update: (change: (c: MenuConfig) => MenuConfig) => void }

export function MenuDrillCard({ config, update }: Props) {
  return (
    <div className="space-y-3 max-w-md">
      <p className="text-xs text-content-secondary">
        For callers on the Cover flow menu style. Slide is off at 40 columns and on C64 terminals.
      </p>
      <label className="flex items-center gap-2 text-sm text-content-primary">
        <input type="checkbox" checked={config.coverflow.slide} onChange={e => update(c => setCoverFlowSlide(c, e.target.checked))} />
        Slide between pages
      </label>
    </div>
  );
}
