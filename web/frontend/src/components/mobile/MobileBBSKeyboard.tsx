import { useRef, useEffect, useState, useCallback } from 'react';
import './MobileBBSKeyboard.css';

interface MobileBBSKeyboardProps {
  onKey: (data: string) => void;
}

const SHIFT_KEY = '__SHIFT__';
const MODE_KEY = '__MODE__';
const ALT_KEY = '__ALT__';

interface KeyDef {
  label: string;
  data: string;
  wide?: boolean;
  cls?: string;
}

/**
 * Which set of keys is showing, named as the phone names them.
 *
 * Three layers, because that is what people already know: letters, then the
 * 123 layer for digits and common punctuation, then the #+= layer for the
 * rest. A single letters/symbols toggle put brackets and braces on the same
 * page as the digits and matched nothing anyone has used before.
 */
type KeyboardMode = 'letters' | 'numbers' | 'symbols';

/**
 * Arrows and Escape, which a phone keyboard has no reason to carry and a
 * terminal cannot do without. Kept on its own row above the layout so every
 * other key sits where muscle memory expects it.
 */
const NAV_ROW: KeyDef[] = [
  { label: '←', data: '\x1b[D', cls: 'mobile-bbs-keyboard__key--nav' },
  { label: '↑', data: '\x1b[A', cls: 'mobile-bbs-keyboard__key--nav' },
  { label: '↓', data: '\x1b[B', cls: 'mobile-bbs-keyboard__key--nav' },
  { label: '→', data: '\x1b[C', cls: 'mobile-bbs-keyboard__key--nav' },
  { label: 'ESC', data: '\x1b', cls: 'mobile-bbs-keyboard__key--nav' },
  { label: 'Tab', data: '\t', cls: 'mobile-bbs-keyboard__key--nav' },
];

/** The bottom row a phone keyboard always has. */
function bottomRow(left: KeyDef): KeyDef[] {
  return [
    left,
    { label: 'space', data: ' ', wide: true, cls: 'mobile-bbs-keyboard__key--space' },
    { label: 'return', data: '\r', wide: true, cls: 'mobile-bbs-keyboard__key--return' },
  ];
}

/** Letter keys carry LOWERCASE data; the label follows the shift state. */
function letters(row: string): KeyDef[] {
  return row.split('').map(ch => ({ label: ch, data: ch }));
}

function keys(row: string[]): KeyDef[] {
  return row.map(ch => ({ label: ch, data: ch }));
}

const LETTER_ROWS: KeyDef[][] = [
  NAV_ROW,
  letters('qwertyuiop'),
  letters('asdfghjkl'),
  [
    { label: '⇧', data: SHIFT_KEY, cls: 'mobile-bbs-keyboard__key--shift' },
    ...letters('zxcvbnm'),
    { label: '⌫', data: '\x7f', cls: 'mobile-bbs-keyboard__key--backspace' },
  ],
  bottomRow({ label: '123', data: MODE_KEY, cls: 'mobile-bbs-keyboard__key--mode' }),
];

/** The 123 layer, laid out as the phone lays it out. */
const NUMBER_ROWS: KeyDef[][] = [
  NAV_ROW,
  keys(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']),
  keys(['-', '/', ':', ';', '(', ')', '$', '&', '@', '"']),
  [
    { label: '#+=', data: ALT_KEY, cls: 'mobile-bbs-keyboard__key--mode' },
    ...keys(['.', ',', '?', '!', "'"]),
    { label: '⌫', data: '\x7f', cls: 'mobile-bbs-keyboard__key--backspace' },
  ],
  bottomRow({ label: 'ABC', data: MODE_KEY, cls: 'mobile-bbs-keyboard__key--mode' }),
];

/**
 * The #+= layer.
 *
 * Between this and the 123 layer every printable ASCII character is
 * reachable - a password typed on a real keyboard can be typed here too.
 * The phone's own layer has a few characters this one does not (£, ¥, •);
 * they are left out deliberately, because this BBS is ASCII and an Amiga
 * client cannot render them.
 */
const SYMBOL_ROWS: KeyDef[][] = [
  NAV_ROW,
  keys(['[', ']', '{', '}', '#', '%', '^', '*', '+', '=']),
  keys(['_', '\\', '|', '~', '<', '>', '`', '\'', '"', '$']),
  [
    { label: '123', data: ALT_KEY, cls: 'mobile-bbs-keyboard__key--mode' },
    ...keys(['.', ',', '?', '!', '/']),
    { label: '⌫', data: '\x7f', cls: 'mobile-bbs-keyboard__key--backspace' },
  ],
  bottomRow({ label: 'ABC', data: MODE_KEY, cls: 'mobile-bbs-keyboard__key--mode' }),
];

const LAYOUTS: Record<KeyboardMode, KeyDef[][]> = {
  letters: LETTER_ROWS,
  numbers: NUMBER_ROWS,
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
      // ABC <-> 123, as the phone does it. Shift is a letters-only idea;
      // leaving it armed across the switch would upper-case nothing and
      // leave the indicator lit for no reason.
      setShift(false);
      setMode(m => (m === 'letters' ? 'numbers' : 'letters'));
      return;
    }
    if (raw === ALT_KEY) {
      // The 123 <-> #+= toggle, which never returns to letters - that is
      // what the ABC key is for.
      setShift(false);
      setMode(m => (m === 'numbers' ? 'symbols' : 'numbers'));
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
            const cls = [
              'mobile-bbs-keyboard__key',
              key.cls ?? '',
              key.wide ? 'mobile-bbs-keyboard__key--wide' : '',
              isShiftKey && shift ? 'mobile-bbs-keyboard__key--shift-active' : '',
            ].filter(Boolean).join(' ');
            // The key CAP follows the shift state, the way a phone's does.
            // The caps used to be hardcoded uppercase, so shift changed
            // nothing you could see - which makes typing a password a
            // guessing game about which case you are actually in.
            const isLetter = /^[a-z]$/.test(key.data);
            const label = isLetter && shift ? key.label.toUpperCase() : key.label;
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
