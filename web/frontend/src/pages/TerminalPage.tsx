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
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const handleKey = useCallback((data: string) => {
    terminalRef.current?.sendCommand(data);
  }, []);

  const handleOpenNativeKeyboard = useCallback(() => {
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
