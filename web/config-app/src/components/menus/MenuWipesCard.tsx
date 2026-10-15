import type { MenuConfig } from '@bbs/screens/menu-config/menu-config';
import { setWipe, setWipeAt40, wipeOptions, type WipeEvent } from './menu-edit';
import { INPUT_CLASS } from './menu-styles';

interface Props { config: MenuConfig; update: (change: (c: MenuConfig) => MenuConfig) => void }

const EVENTS: Array<{ event: WipeEvent; label: string }> = [
  { event: 'open', label: 'Open' },
  { event: 'leave', label: 'Leaving to a command' },
  { event: 'page', label: 'Changing pages' },
];

export function MenuWipesCard({ config, update }: Props) {
  const options = wipeOptions();
  return (
    <div className="space-y-3 max-w-md">
      <p className="text-xs text-content-secondary">The screen wipe the board plays for each moment. Random picks one each time.</p>
      {EVENTS.map(({ event, label }) => (
        <label key={event} className="block text-sm text-content-primary">
          <span className="block mb-1">{label}</span>
          <select className={INPUT_CLASS} value={config.wipes[event]} onChange={e => update(c => setWipe(c, event, e.target.value))}>
            {options.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}
          </select>
        </label>
      ))}
      <label className="flex items-center gap-2 text-sm text-content-primary">
        <input type="checkbox" checked={config.wipes.at40} onChange={e => update(c => setWipeAt40(c, e.target.checked))} />
        Play wipes for 40-column callers
      </label>
    </div>
  );
}
