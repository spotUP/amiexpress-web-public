import { useRef, useState, useEffect, useCallback } from 'react';
import { BBSTerminal, type BBSTerminalRef } from '@amiexpress/terminal';
import { MobileBBSKeyboard } from '../components/mobile/MobileBBSKeyboard';

// Mosoul char width ≈ fontSize * CHAR_ASPECT; tune if actual fit differs
const CHAR_ASPECT = 0.6;
const BBS_COLS = 80;
const KEYBOARD_HEIGHT = 200;
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

  useEffect(() => {
    const handleResize = () => {
      const mobile = isPortraitMobile();
      setIsMobile(mobile);
      setFontSize(mobile ? computeFontSize(window.innerWidth) : 16);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    // Mosoul font may not be loaded when xterm first measures character widths.
    // Once all fonts are ready, fire a synthetic resize so FitAddon remeasures
    // with correct metrics — eliminates the "wrong size until tilt" bug on mobile.
    document.fonts.ready.then(() => {
      window.dispatchEvent(new Event('resize'));
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // On mobile: xterm keeps a hidden textarea focused to capture input.
  // iOS sees any focused textarea and opens the native keyboard.
  // inputmode="none" tells iOS not to show a virtual keyboard for this element.
  // Applied after a short delay to let the terminal initialize its DOM.
  useEffect(() => {
    if (!isMobile) return;
    const timer = setTimeout(() => {
      const textarea = terminalRef.current?.getTerminal()?.textarea;
      if (textarea) textarea.setAttribute('inputmode', 'none');
    }, 600);
    return () => clearTimeout(timer);
  }, [isMobile]);

  const handleKey = useCallback((data: string) => {
    // If user previously used ABC (inputmode=text), restore suppression on next custom keypress
    const textarea = terminalRef.current?.getTerminal()?.textarea;
    if (textarea && textarea.getAttribute('inputmode') !== 'none') {
      textarea.setAttribute('inputmode', 'none');
    }
    terminalRef.current?.sendCommand(data);
  }, []);

  const handleOpenNativeKeyboard = useCallback(() => {
    // Temporarily allow native keyboard for text entry
    const textarea = terminalRef.current?.getTerminal()?.textarea;
    if (textarea) textarea.setAttribute('inputmode', 'text');
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
        forcedMode={isMobile ? 'wide' : undefined}
      />
      {isMobile && (
        <MobileBBSKeyboard
          onKey={handleKey}
          onOpenNativeKeyboard={handleOpenNativeKeyboard}
        />
      )}
    </div>
  );
}
