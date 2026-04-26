import { useRef, useEffect } from 'react';
import './MobileBBSKeyboard.css';

interface MobileBBSKeyboardProps {
  onKey: (data: string) => void;
}

interface KeyDef {
  label: string;
  data: string;
  wide?: boolean;
  cls?: string;
}

const ROWS: KeyDef[][] = [
  // BBS navigation row
  [
    { label: '←', data: '\x1b[D', cls: 'mobile-bbs-keyboard__key--nav' },
    { label: '↑', data: '\x1b[A', cls: 'mobile-bbs-keyboard__key--nav' },
    { label: '↓', data: '\x1b[B', cls: 'mobile-bbs-keyboard__key--nav' },
    { label: '→', data: '\x1b[C', cls: 'mobile-bbs-keyboard__key--nav' },
    { label: 'ESC',   data: '\x1b',  cls: 'mobile-bbs-keyboard__key--nav' },
    { label: 'Ret',   data: '\r',    wide: true, cls: 'mobile-bbs-keyboard__key--nav' },
    { label: '⌫',     data: '\x7f', cls: 'mobile-bbs-keyboard__key--nav' },
    { label: 'Spc',   data: ' ',    cls: 'mobile-bbs-keyboard__key--nav' },
  ],
  // Number row
  [
    { label: '1', data: '1' }, { label: '2', data: '2' }, { label: '3', data: '3' },
    { label: '4', data: '4' }, { label: '5', data: '5' }, { label: '6', data: '6' },
    { label: '7', data: '7' }, { label: '8', data: '8' }, { label: '9', data: '9' },
    { label: '0', data: '0' },
  ],
  // QWERTY row 1
  [
    { label: 'Q', data: 'q' }, { label: 'W', data: 'w' }, { label: 'E', data: 'e' },
    { label: 'R', data: 'r' }, { label: 'T', data: 't' }, { label: 'Y', data: 'y' },
    { label: 'U', data: 'u' }, { label: 'I', data: 'i' }, { label: 'O', data: 'o' },
    { label: 'P', data: 'p' },
  ],
  // QWERTY row 2
  [
    { label: 'A', data: 'a' }, { label: 'S', data: 's' }, { label: 'D', data: 'd' },
    { label: 'F', data: 'f' }, { label: 'G', data: 'g' }, { label: 'H', data: 'h' },
    { label: 'J', data: 'j' }, { label: 'K', data: 'k' }, { label: 'L', data: 'l' },
  ],
  // QWERTY row 3
  [
    { label: 'Z', data: 'z' }, { label: 'X', data: 'x' }, { label: 'C', data: 'c' },
    { label: 'V', data: 'v' }, { label: 'B', data: 'b' }, { label: 'N', data: 'n' },
    { label: 'M', data: 'm' }, { label: '.', data: '.' }, { label: ',', data: ',' },
    { label: '⌫', data: '\x7f' },
  ],
];

export function MobileBBSKeyboard({ onKey }: MobileBBSKeyboardProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  // Use a non-passive touchstart listener via event delegation.
  // Non-passive allows e.preventDefault() to block scroll/zoom/focus-steal on iOS.
  // More reliable than React's onPointerDown which can be inconsistent on iOS Safari.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: TouchEvent) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-bbs-key]');
      if (!button) return;
      e.preventDefault(); // block scroll, double-tap zoom, and focus steal
      const data = button.dataset.bbsKey ?? '';
      onKey(data);
    };

    el.addEventListener('touchstart', handler, { passive: false });
    return () => el.removeEventListener('touchstart', handler);
  }, [onKey]);

  return (
    <div className="mobile-bbs-keyboard" ref={containerRef}>
      {ROWS.map((row, ri) => (
        <div key={ri} className="mobile-bbs-keyboard__row">
          {row.map((key, ki) => {
            const cls = [
              'mobile-bbs-keyboard__key',
              key.cls ?? '',
              key.wide ? 'mobile-bbs-keyboard__key--wide' : '',
            ].filter(Boolean).join(' ');
            return (
              <button
                key={ki}
                className={cls}
                data-bbs-key={key.data}
                type="button"
                aria-label={key.label}
              >
                {key.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
