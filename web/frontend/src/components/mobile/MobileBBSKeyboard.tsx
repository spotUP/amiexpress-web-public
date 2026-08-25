import { useRef, useEffect, useState, useCallback } from 'react';
import './MobileBBSKeyboard.css';

interface MobileBBSKeyboardProps {
  onKey: (data: string) => void;
}

const SHIFT_KEY = '__SHIFT__';
const MODE_KEY = '__MODE__';

interface KeyDef {
  label: string;
  data: string;
  wide?: boolean;
  cls?: string;
}

/**
 * Which set of keys is showing. Letters cannot reach '!' or '#', and a BBS
 * password commonly has both, so there has to be a way to get at the symbols
 * - the same letters/symbols toggle a phone keyboard has.
 */
type KeyboardMode = 'letters' | 'symbols';

/** The row every layout keeps: arrows, Escape, Return, Backspace, Space. */
const NAV_ROW: KeyDef[] = [
  { label: '←', data: '\x1b[D', cls: 'mobile-bbs-keyboard__key--nav' },
  { label: '↑', data: '\x1b[A', cls: 'mobile-bbs-keyboard__key--nav' },
  { label: '↓', data: '\x1b[B', cls: 'mobile-bbs-keyboard__key--nav' },
  { label: '→', data: '\x1b[C', cls: 'mobile-bbs-keyboard__key--nav' },
  { label: 'ESC',   data: '\x1b',  cls: 'mobile-bbs-keyboard__key--nav' },
  { label: 'Ret',   data: '\r',    wide: true, cls: 'mobile-bbs-keyboard__key--nav' },
  { label: '⌫',     data: '\x7f', cls: 'mobile-bbs-keyboard__key--nav' },
  { label: 'Spc',   data: ' ',    cls: 'mobile-bbs-keyboard__key--nav' },
];

const LETTER_ROWS: KeyDef[][] = [
  NAV_ROW,
  // Number row
  [
    { label: '1', data: '1' }, { label: '2', data: '2' }, { label: '3', data: '3' },
    { label: '4', data: '4' }, { label: '5', data: '5' }, { label: '6', data: '6' },
    { label: '7', data: '7' }, { label: '8', data: '8' }, { label: '9', data: '9' },
    { label: '0', data: '0' },
    // Also part of everyday email addresses (my-mail.com, first_last@...).
    { label: '-', data: '-' }, { label: '_', data: '_' },
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
    // Registration asks for an email address, which is unreachable without
    // these. Sitting at the end of the short row keeps every other key where
    // muscle memory left it.
    { label: '@', data: '@' },
  ],
  // QWERTY row 3
  [
    { label: '⇧', data: SHIFT_KEY, cls: 'mobile-bbs-keyboard__key--shift' },
    { label: 'Z', data: 'z' }, { label: 'X', data: 'x' }, { label: 'C', data: 'c' },
    { label: 'V', data: 'v' }, { label: 'B', data: 'b' }, { label: 'N', data: 'n' },
    { label: 'M', data: 'm' }, { label: '.', data: '.' }, { label: ',', data: ',' },
    { label: '!#1', data: MODE_KEY, cls: 'mobile-bbs-keyboard__key--mode' },
  ],
];

/**
 * Everything a password can contain that the letter layout cannot reach.
 *
 * This is the printable ASCII set minus the letters, digits and the handful
 * already on the letter layout, so any password a user can type on a real
 * keyboard can be typed here too.
 */
const SYMBOL_ROWS: KeyDef[][] = [
  NAV_ROW,
  [
    { label: '!', data: '!' }, { label: '"', data: '"' }, { label: '#', data: '#' },
    { label: '$', data: '$' }, { label: '%', data: '%' }, { label: '&', data: '&' },
    { label: "'", data: "'" }, { label: '(', data: '(' }, { label: ')', data: ')' },
    { label: '*', data: '*' },
  ],
  [
    { label: '+', data: '+' }, { label: ',', data: ',' }, { label: '-', data: '-' },
    { label: '.', data: '.' }, { label: '/', data: '/' }, { label: ':', data: ':' },
    { label: ';', data: ';' }, { label: '<', data: '<' }, { label: '=', data: '=' },
    { label: '>', data: '>' },
  ],
  [
    { label: '?', data: '?' }, { label: '@', data: '@' }, { label: '[', data: '[' },
    { label: '\\', data: '\\' }, { label: ']', data: ']' }, { label: '^', data: '^' },
    { label: '_', data: '_' }, { label: '`', data: '`' }, { label: '{', data: '{' },
    { label: '|', data: '|' },
  ],
  [
    { label: '}', data: '}' }, { label: '~', data: '~' },
    { label: 'ABC', data: MODE_KEY, cls: 'mobile-bbs-keyboard__key--mode' },
  ],
];

const LAYOUTS: Record<KeyboardMode, KeyDef[][]> = {
  letters: LETTER_ROWS,
  symbols: SYMBOL_ROWS,
};

export function MobileBBSKeyboard({ onKey }: MobileBBSKeyboardProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(false);
  const [mode, setMode] = useState<KeyboardMode>('letters');
  const shiftRef = useRef(shift);
  shiftRef.current = shift;

  const handleKey = useCallback((raw: string) => {
    if (raw === SHIFT_KEY) {
      setShift(s => !s);
      return;
    }
    if (raw === MODE_KEY) {
      // Shift is a letters-only idea; leaving it armed across the switch
      // would upper-case nothing and confuse the indicator.
      setShift(false);
      setMode(m => (m === 'letters' ? 'symbols' : 'letters'));
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
      {LAYOUTS[mode].map((row, ri) => (
        <div key={ri} className="mobile-bbs-keyboard__row">
          {row.map((key, ki) => {
            const isShiftKey = key.data === SHIFT_KEY;
            const isModeKey = key.data === MODE_KEY;
            const cls = [
              'mobile-bbs-keyboard__key',
              key.cls ?? '',
              key.wide ? 'mobile-bbs-keyboard__key--wide' : '',
              isShiftKey && shift ? 'mobile-bbs-keyboard__key--shift-active' : '',
            ].filter(Boolean).join(' ');
            const label = !isShiftKey && !isModeKey && shift && key.data.length === 1
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
