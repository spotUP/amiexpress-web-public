import './MobileBBSKeyboard.css';

interface MobileBBSKeyboardProps {
  onKey: (data: string) => void;
  onOpenNativeKeyboard: () => void;
}

interface KeyDef {
  label: string;
  data: string;
  wide?: boolean;
  cls?: string;
}

// data='' means ABC (open native keyboard)
const ROWS: KeyDef[][] = [
  [
    { label: '←', data: '\x1b[D', cls: 'mobile-bbs-keyboard__key--arrow' },
    { label: '↑', data: '\x1b[A', cls: 'mobile-bbs-keyboard__key--arrow' },
    { label: '↓', data: '\x1b[B', cls: 'mobile-bbs-keyboard__key--arrow' },
    { label: '→', data: '\x1b[C', cls: 'mobile-bbs-keyboard__key--arrow' },
  ],
  [
    { label: 'ESC',   data: '\x1b' },
    { label: 'Enter', data: '\r', wide: true },
    { label: 'BS',    data: '\x7f' },
    { label: 'Spc',   data: ' ' },
  ],
  [
    { label: '1', data: '1' }, { label: '2', data: '2' }, { label: '3', data: '3' },
    { label: '4', data: '4' }, { label: '5', data: '5' }, { label: '6', data: '6' },
    { label: '7', data: '7' }, { label: '8', data: '8' }, { label: '9', data: '9' },
    { label: '0', data: '0' },
  ],
  [
    { label: 'Y', data: 'y' }, { label: 'N', data: 'n' }, { label: 'R', data: 'r' },
    { label: 'L', data: 'l' }, { label: 'G', data: 'g' }, { label: 'Q', data: 'q' },
    { label: '+', data: '+' },
    { label: 'ABC', data: '', cls: 'mobile-bbs-keyboard__key--abc' },
  ],
];

export function MobileBBSKeyboard({ onKey, onOpenNativeKeyboard }: MobileBBSKeyboardProps): JSX.Element {
  return (
    <div className="mobile-bbs-keyboard">
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
                onPointerDown={(e) => {
                  e.preventDefault(); // prevent focus steal from terminal
                  if (key.data === '') {
                    onOpenNativeKeyboard();
                  } else {
                    onKey(key.data);
                  }
                }}
                onClick={(e) => e.preventDefault()}
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
