import { useRef, useState, useEffect, useCallback } from 'react';
import { BBSTerminal, type BBSTerminalRef } from '@amiexpress/terminal';
import { MobileBBSKeyboard } from '../components/mobile/MobileBBSKeyboard';

// Conservative initial estimate — corrected precisely in onConnect via xterm element width
const CHAR_ASPECT = 0.75;
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

  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;

  useEffect(() => {
    const handleOrientationChange = () => {
      const mobile = isPortraitMobile();
      setIsMobile(mobile);
      setFontSize(mobile ? computeFontSize(window.innerWidth) : 16);
    };
    const handleResize = () => {
      // Only update on desktop — mobile portrait width never changes via resize
      if (!isPortraitMobile()) {
        setIsMobile(false);
        setFontSize(16);
      }
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    const refocusOnClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.tagName === 'A')) return;
      terminalRef.current?.focus();
    };
    document.addEventListener('click', refocusOnClick, { capture: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      document.removeEventListener('click', refocusOnClick, { capture: true });
    };
  }, []);

  // Suppress iOS native keyboard on portrait mobile; restore on landscape.
  useEffect(() => {
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile && isMobileDevice) {
      const timer = setTimeout(() => {
        const textarea = terminalRef.current?.getTerminal()?.textarea;
        if (textarea) {
          textarea.removeAttribute('inputmode');
          textarea.blur();
        }
      }, 800);
      return () => clearTimeout(timer);
    }
    if (isMobile) {
      const timer = setTimeout(() => {
        const ta = terminalRef.current?.getTerminal()?.textarea;
        if (ta) ta.setAttribute('inputmode', 'none');
      }, 600);
      return () => clearTimeout(timer);
    }
    terminalRef.current?.focus();
  }, [isMobile]);

  // After the terminal connects, measure the actual rendered element width to compute
  // the exact fontSize that fills the screen. xterm's own measurement is authoritative —
  // no Canvas API guesswork. fontSize changes via live-update effect (no reinit/reconnect).
  const handleConnect = useCallback(() => {
    if (!isPortraitMobile()) return;
    requestAnimationFrame(() => {
      const el = terminalRef.current?.getTerminal()?.element;
      if (!el) return;
      // term.element is the outer container (full viewport width in fixed mode).
      // .xterm-screen is the actual rendered cell area = 80 * charWidth pixels.
      const screen = el.querySelector('.xterm-screen') as HTMLElement | null;
      const actualWidth = screen?.offsetWidth ?? 0;
      if (actualWidth <= 0) return;
      const corrected = Math.floor(fontSizeRef.current * window.innerWidth / actualWidth);
      if (corrected > 0 && corrected !== fontSizeRef.current) {
        setFontSize(corrected);
      }
    });
  }, []);

  const handleKey = useCallback((data: string) => {
    terminalRef.current?.injectInput(data);
    terminalRef.current?.focus();
  }, []);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      paddingBottom: isMobile ? KEYBOARD_HEIGHT : 0,
      boxSizing: 'border-box',
      minHeight: 0,
    }}>
      <BBSTerminal
        ref={terminalRef}
        fontSize={fontSize}
        keepFocused
        onConnect={handleConnect}
      />
      {isMobile && (
        <MobileBBSKeyboard
          onKey={handleKey}
        />
      )}
    </div>
  );
}
