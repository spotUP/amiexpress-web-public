import type { MenuConfig } from '@bbs/screens/menu-config/menu-config';
import { setDrillEnabled, setDrillSlide } from './menu-edit';

interface Props { config: MenuConfig; update: (change: (c: MenuConfig) => MenuConfig) => void }

export function MenuDrillCard({ config, update }: Props) {
  return (
    <div className="space-y-3 max-w-md">
      <p className="text-xs text-content-secondary">Shows the menu sections first; Enter opens one, Escape goes back. Slide is off at 40 columns and on C64 terminals.</p>
      <label className="flex items-center gap-2 text-sm text-content-primary">
        <input type="checkbox" checked={config.drill.enabled} onChange={e => update(c => setDrillEnabled(c, e.target.checked))} />
        Drill-down layout
      </label>
      <label className="flex items-center gap-2 text-sm text-content-primary">
        <input type="checkbox" checked={config.drill.slide} disabled={!config.drill.enabled} onChange={e => update(c => setDrillSlide(c, e.target.checked))} />
        Slide between levels
      </label>
    </div>
  );
}
