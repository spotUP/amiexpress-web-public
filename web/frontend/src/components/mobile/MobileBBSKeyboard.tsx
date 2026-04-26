import { useRef, useEffect, useState, useCallback } from 'react';
import './MobileBBSKeyboard.css';

interface MobileBBSKeyboardProps {
  onKey: (data: string) => void;
}

const SHIFT_KEY = '__SHIFT__';

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
    { label: '⇧', data: SHIFT_KEY, cls: 'mobile-bbs-keyboard__key--shift' },
    { label: 'Z', data: 'z' }, { label: 'X', data: 'x' }, { label: 'C', data: 'c' },
    { label: 'V', data: 'v' }, { label: 'B', data: 'b' }, { label: 'N', data: 'n' },
    { label: 'M', data: 'm' }, { label: '.', data: '.' }, { label: ',', data: ',' },
  ],
];

export function MobileBBSKeyboard({ onKey }: MobileBBSKeyboardProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(false);
  const shiftRef = useRef(shift);
  shiftRef.current = shift;

  const handleKey = useCallback((raw: string) => {
    if (raw === SHIFT_KEY) {
      setShift(s => !s);
      return;
    }
    const data = shiftRef.current && raw.length === 1 ? raw.toUpperCase() : raw;
    if (shiftRef.current) setShift(false);  // single-shot shift
    onKey(data);
  }, [onKey]);

  // Use a non-passive touchstart listener via event delegation.
  // Non-passive allows e.preventDefault() to block scroll/zoom/focus-steal on iOS.
  // More reliable than React's onPointerDown which can be inconsistent on iOS Safari.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let touchHandled = false;

    const onTouchStart = (e: TouchEvent) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-bbs-key]');
      if (!button) return;
      e.preventDefault(); // block scroll, double-tap zoom, and focus steal
      touchHandled = true;
      handleKey(button.dataset.bbsKey ?? '');
      setTimeout(() => { touchHandled = false; }, 500);
    };

    // Click fallback for cases where touchstart doesn't fire (some iOS scenarios)
    const onClick = (e: MouseEvent) => {
      if (touchHandled) return;
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-bbs-key]');
      if (!button) return;
      handleKey(button.dataset.bbsKey ?? '');
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('click', onClick);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('click', onClick);
    };
  }, [handleKey]);

  return (
    <div className="mobile-bbs-keyboard" ref={containerRef}>
      {ROWS.map((row, ri) => (
        <div key={ri} className="mobile-bbs-keyboard__row">
          {row.map((key, ki) => {
            const isShiftKey = key.data === SHIFT_KEY;
            const cls = [
              'mobile-bbs-keyboard__key',
              key.cls ?? '',
              key.wide ? 'mobile-bbs-keyboard__key--wide' : '',
              isShiftKey && shift ? 'mobile-bbs-keyboard__key--shift-active' : '',
            ].filter(Boolean).join(' ');
            const label = !isShiftKey && shift && key.data.length === 1
              ? key.label.toUpperCase()
              : key.label;
            return (
              <button
                key={ki}
                className={cls}
                data-bbs-key={key.data}
                type="button"
                aria-label={label}
              >
                {label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
