import { useRef, useState, useEffect, useCallback } from 'react';
import { BBSTerminal, type BBSTerminalRef } from '@amiexpress/terminal';
import { MobileBBSKeyboard } from '../components/mobile/MobileBBSKeyboard';

// Mosoul char aspect ratio (charWidth / fontSize). 0.75 gives a conservative
// initial estimate that is close to actual — Canvas API corrects the remainder.
// 0.6 was too optimistic (gave fontSize=8 which overflowed; actual is ~0.75).
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

  // Ref so async callbacks always read the latest fontSize without stale closures
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;

  useEffect(() => {
    // orientationchange is the reliable signal for portrait↔landscape transitions.
    // resize fires constantly on iOS (browser chrome show/hide, address bar scroll)
    // and can flip window.innerHeight > window.innerWidth transiently during login,
    // causing isMobile to go false → fontSize=16 (too big). Don't use resize for
    // mobile detection — only use it on desktop for potential window resizes.
    const handleOrientationChange = () => {
      const mobile = isPortraitMobile();
      setIsMobile(mobile);
      setFontSize(mobile ? computeFontSize(window.innerWidth) : 16);
    };
    const handleResize = () => {
      if (!isPortraitMobile()) {
        // Desktop: update font size if window is resized
        setIsMobile(false);
        setFontSize(16);
      }
      // Mobile portrait: ignore resize — screen width doesn't change,
      // only height fluctuates with browser chrome. orientationchange handles rotation.
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    // Desktop fallback: clicking anywhere on the page refocuses the terminal.
    // Prevents the "clicked outside and lost focus" problem on desktop.
    // capture:true so it fires before any element's own click handler.
    const refocusOnClick = (e: MouseEvent) => {
      // Don't interfere if a specific interactive element captured the click
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.tagName === 'A')) return;
      terminalRef.current?.focus();
    };
    document.addEventListener('click', refocusOnClick, { capture: true });

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
      window.removeEventListener('orientationchange', handleOrientationChange);
      document.removeEventListener('click', refocusOnClick, { capture: true });
    };
  }, []);

  // Portrait mobile: suppress iOS native keyboard via inputmode="none".
  // Landscape mobile: blur after rotation so iOS keyboard doesn't appear uninvited.
  // Desktop: no action — terminal stays focused naturally via keepFocused prop.
  useEffect(() => {
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile && isMobileDevice) {
      // Landscape mobile: remove inputmode restriction and blur to prevent keyboard
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
      // Portrait mobile: suppress native keyboard
      const timer = setTimeout(() => {
        const ta = terminalRef.current?.getTerminal()?.textarea;
        if (ta) ta.setAttribute('inputmode', 'none');
      }, 600);
      return () => clearTimeout(timer);
    }
    // Desktop: focus the terminal on mount/reconnect
    terminalRef.current?.focus();
  }, [isMobile]);

  const handleKey = useCallback((data: string) => {
    terminalRef.current?.injectInput(data);
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
        keepFocused
      />
      {isMobile && (
        <MobileBBSKeyboard
          onKey={handleKey}
        />
      )}
    </div>
  );
}
