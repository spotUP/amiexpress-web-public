import { useState } from 'react';
import type { MenuConfig, OverflowMode, WidthClass } from '@bbs/screens/menu-config/menu-config';
import { addOverflowFloor, removeOverflowFloor, setOverflowMode } from './menu-edit';
import { BUTTON_CLASS, INPUT_CLASS } from './menu-styles';

interface Props { config: MenuConfig; update: (change: (c: MenuConfig) => MenuConfig) => void }

const CLASSES: Array<{ cls: WidthClass; label: string }> = [
  { cls: 'c64', label: 'C64 (40 columns)' },
  { cls: 'standard', label: 'Standard (80 columns)' },
  { cls: 'wide', label: 'Wide (120 columns and more)' },
];

function ClassRows({ cls, label, config, update }: Props & { cls: WidthClass; label: string }) {
  const [floorText, setFloorText] = useState('');
  const floors = Object.keys(config.overflow[cls]).map(Number).sort((a, b) => a - b);
  return (
    <fieldset className="border border-border rounded p-3 space-y-2">
      <legend className="px-1 text-sm text-content-primary">{label}</legend>
      {floors.map(floor => (
        <div key={floor} className="flex items-center gap-2 text-sm text-content-primary">
          <span className="w-40">Level {floor} and above</span>
          <select
            aria-label={`${label} at level ${floor}`}
            className={INPUT_CLASS}
            value={config.overflow[cls][String(floor)]}
            onChange={e => update(c => setOverflowMode(c, cls, floor, e.target.value as OverflowMode))}
          >
            <option value="scroll">Scroll</option>
            <option value="pages">Pages</option>
          </select>
          <button className={BUTTON_CLASS} disabled={floor === 0} onClick={() => update(c => removeOverflowFloor(c, cls, floor))}>Remove</button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input aria-label={`New level floor for ${label}`} className={INPUT_CLASS} type="number" min={0} max={65535} value={floorText} onChange={e => setFloorText(e.target.value)} />
        <button className={`${BUTTON_CLASS} whitespace-nowrap`} disabled={floorText === ''} onClick={() => { update(c => addOverflowFloor(c, cls, Number(floorText))); setFloorText(''); }}>
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
        When the entries do not fit the screen, the menu scrolls or shows a page at a time. These are the defaults;
        Callers can change this for themselves under W, Appearance, Long menus.
      </p>
      {CLASSES.map(({ cls, label }) => <ClassRows key={cls} cls={cls} label={label} config={config} update={update} />)}
    </div>
  );
}
