import { useState } from 'react';
import { MENU_STYLES, type MenuConfig, type MenuStyle, type WidthClass } from '@bbs/screens/menu-config/menu-config';
import { MENU_STYLE_NAMES, addStyleFloor, removeStyleFloor, setMenuStyle } from './menu-edit';
import { BUTTON_CLASS, INPUT_CLASS } from './menu-styles';

interface Props { config: MenuConfig; update: (change: (c: MenuConfig) => MenuConfig) => void }

const CLASSES: Array<{ cls: WidthClass; label: string }> = [
  { cls: 'c64', label: 'C64 (40 columns)' },
  { cls: 'standard', label: 'Standard (80 columns)' },
  { cls: 'wide', label: 'Wide (120 columns and more)' },
];

function ClassRows({ cls, label, config, update }: Props & { cls: WidthClass; label: string }) {
  const [floorText, setFloorText] = useState('');
  const floors = Object.keys(config.style[cls]).map(Number).sort((a, b) => a - b);
  return (
    <fieldset className="border border-border rounded p-3 space-y-2">
      <legend className="px-1 text-sm text-content-primary">{label}</legend>
      {floors.map(floor => (
        <div key={floor} className="flex items-center gap-2 text-sm text-content-primary">
          <span className="w-40">Level {floor} and above</span>
          <select
            aria-label={`${label} at level ${floor}`}
            className={INPUT_CLASS}
            value={config.style[cls][String(floor)]}
            onChange={e => update(c => setMenuStyle(c, cls, floor, e.target.value as MenuStyle))}
          >
            {MENU_STYLES.map(s => <option key={s} value={s}>{MENU_STYLE_NAMES[s]}</option>)}
          </select>
          <button className={BUTTON_CLASS} disabled={floor === 0} onClick={() => update(c => removeStyleFloor(c, cls, floor))}>Remove</button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input aria-label={`New level floor for ${label}`} className={INPUT_CLASS} type="number" min={0} max={65535} value={floorText} onChange={e => setFloorText(e.target.value)} />
        <button className={`${BUTTON_CLASS} whitespace-nowrap`} disabled={floorText === ''} onClick={() => { update(c => addStyleFloor(c, cls, Number(floorText))); setFloorText(''); }}>
          Add level
        </button>
      </div>
    </fieldset>
  );
}

export function MenuOverflowCard({ config, update }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-content-secondary">
        How the main menu is shown: the classic menu screen, a grid that scrolls, a grid a page at a time, or cover flow
        (sections first, Enter opens one, Escape goes back). These are the defaults; callers can change this for
        themselves under W, Appearance, Menu style.
      </p>
      {CLASSES.map(({ cls, label }) => <ClassRows key={cls} cls={cls} label={label} config={config} update={update} />)}
    </div>
  );
}
