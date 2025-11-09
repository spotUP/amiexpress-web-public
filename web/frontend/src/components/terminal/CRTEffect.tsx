import React from 'react';

interface CRTEffectProps {
  children: React.ReactNode;
  enabled?: boolean;
  intensity?: 'low' | 'medium' | 'high';
  className?: string;
}

export const CRTEffect: React.FC<CRTEffectProps> = ({
  children,
  enabled = true,
  intensity = 'medium',
  className = '',
}) => {
  if (!enabled) {
    return <>{children}</>;
  }

  const intensitySettings = {
    low: { scanlineOpacity: 0.02, glowBlur: 1 },
    medium: { scanlineOpacity: 0.05, glowBlur: 2 },
    high: { scanlineOpacity: 0.1, glowBlur: 3 },
  };

  const { scanlineOpacity, glowBlur } = intensitySettings[intensity];

  return (
    <div className={`crt-effect relative ${className}`} style={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
      {/* Content */}
      <div className="relative z-10" style={{ width: '100%', height: '100%' }}>{children}</div>

      {/* Scanlines overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-20"
        style={{
          background: `repeating-linear-gradient(
            0deg,
            rgba(0, 0, 0, ${scanlineOpacity}) 0px,
            transparent 1px,
            transparent 2px,
            rgba(0, 0, 0, ${scanlineOpacity}) 3px
          )`,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          position: 'absolute',
        }}
      />

      {/* CRT curve/vignette effect */}
      <div
        className="absolute inset-0 pointer-events-none z-20"
        style={{
          background: `radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, 0.3) 100%)`,
          borderRadius: '4px',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          position: 'absolute',
        }}
      />

      {/* Glow effect */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          filter: `blur(${glowBlur}px)`,
          opacity: 0.3,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          position: 'absolute',
        }}
      >
        {children}
      </div>

      {/* Flicker animation */}
      <style>{`
        .crt-effect {
          animation: crt-flicker 0.15s infinite alternate;
        }

        @keyframes crt-flicker {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.98;
          }
        }
      `}</style>
    </div>
  );
};

export default CRTEffect;
