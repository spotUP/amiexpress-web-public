import { useRef, useState, useEffect, useCallback } from 'react';
import { BBSTerminal, type BBSTerminalRef } from '@amiexpress/terminal';
import { MobileBBSKeyboard } from '../components/mobile/MobileBBSKeyboard';

// Rough initial estimate — corrected via Canvas API after font loads
const CHAR_ASPECT = 0.6;
const BBS_COLS = 80;
const KEYBOARD_HEIGHT = 260;
const PORTRAIT_MOBILE_MAX_WIDTH = 600;

function isPortraitMobile(): boolean {
  return window.innerWidth < PORTRAIT_MOBILE_MAX_WIDTH && window.innerHeight > window.innerWidth;
}

function computeFontSize(containerWidth: number): number {
  return Math.floor(containerWidth / BBS_COLS / CHAR_ASPECT);
}

export function TerminalPage(): JSX.Element {
  const terminalRef = useRef<BBSTerminalRef>(null);
  const [isMobile, setIsMobile] = useState<boolean>(isPortraitMobile);
  const [fontSize, setFontSize] = useState<number>(() =>
    isPortraitMobile() ? computeFontSize(window.innerWidth) : 16
  );

  // Ref so async callbacks always read the latest fontSize without stale closures
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;

  useEffect(() => {
    const handleResize = () => {
      const mobile = isPortraitMobile();
      setIsMobile(mobile);
      setFontSize(mobile ? computeFontSize(window.innerWidth) : 16);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    // Measure Mosoul's actual character width via Canvas API (no dependency on xterm
    // initialization timing) and correct fontSize so 80 cols fits the screen exactly.
    if (isPortraitMobile()) {
      const probe = fontSizeRef.current;
      document.fonts.load(`${probe}px mosoul`).then(() => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.font = `${probe}px mosoul`;
        const charWidth = ctx.measureText('W').width;
        if (charWidth <= 0) return;
        const corrected = Math.floor(window.innerWidth / (BBS_COLS * charWidth) * probe);
        if (corrected > 0 && corrected !== fontSizeRef.current) {
          setFontSize(corrected);
        }
      });
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Portrait: suppress iOS native keyboard via inputmode="none".
  // Landscape: terminal auto-focuses on reconnect which triggers iOS keyboard —
  // blur after rotation settles so the keyboard doesn't appear uninvited.
  useEffect(() => {
    if (!isMobile) {
      const timer = setTimeout(() => {
        const textarea = terminalRef.current?.getTerminal()?.textarea;
        if (textarea) {
          textarea.removeAttribute('inputmode');
          textarea.blur();
        }
      }, 800);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      const ta = terminalRef.current?.getTerminal()?.textarea;
      if (ta) ta.setAttribute('inputmode', 'none');
    }, 600);
    return () => clearTimeout(timer);
  }, [isMobile]);

  const handleKey = useCallback((data: string) => {
    // Use term.input() — same pipeline as a physical keyboard (fires onData → socket),
    // no socket.connected guard that could silently drop keystrokes.
    const term = terminalRef.current?.getTerminal();
    if (term) {
      term.input(data, true);
    } else {
      terminalRef.current?.sendCommand(data);
    }
    terminalRef.current?.focus();
  }, []);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      // Reserve space below terminal so content isn't hidden behind fixed keyboard
      paddingBottom: isMobile ? KEYBOARD_HEIGHT : 0,
      boxSizing: 'border-box',
      minHeight: 0,
    }}>
      <BBSTerminal
        ref={terminalRef}
        fontSize={fontSize}
        keepFocused={isMobile}
      />
      {isMobile && (
        <MobileBBSKeyboard
          onKey={handleKey}
        />
      )}
    </div>
  );
}
