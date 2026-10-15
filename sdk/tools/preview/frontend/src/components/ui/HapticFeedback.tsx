import React, { useEffect, useState } from 'react';

type FeedbackType = 'shake' | 'bounce' | 'pulse' | 'flash' | 'ripple';

interface HapticFeedbackProps {
  type: FeedbackType;
  trigger: boolean;
  duration?: number;
  onComplete?: () => void;
  children: React.ReactNode;
}

export const HapticFeedback: React.FC<HapticFeedbackProps> = ({
  type,
  trigger,
  duration = 500,
  onComplete,
  children,
}) => {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (trigger) {
      setIsAnimating(true);
      const timeout = setTimeout(() => {
        setIsAnimating(false);
        onComplete?.();
      }, duration);
      return () => clearTimeout(timeout);
    }
  }, [trigger, duration, onComplete]);

  const getAnimationClass = () => {
    if (!isAnimating) return '';

    switch (type) {
      case 'shake':
        return 'animate-shake';
      case 'bounce':
        return 'animate-bounce';
      case 'pulse':
        return 'animate-pulse';
      case 'flash':
        return 'animate-flash';
      case 'ripple':
        return 'animate-ripple';
      default:
        return '';
    }
  };

  return (
    <div className={`relative ${getAnimationClass()}`}>
      {children}

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-10px); }
          20%, 40%, 60%, 80% { transform: translateX(10px); }
        }

        @keyframes flash {
          0%, 50%, 100% { opacity: 1; }
          25%, 75% { opacity: 0.5; }
        }

        @keyframes ripple {
          0% {
            box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7),
                        0 0 0 10px rgba(59, 130, 246, 0.5),
                        0 0 0 20px rgba(59, 130, 246, 0.3);
          }
          100% {
            box-shadow: 0 0 0 10px rgba(59, 130, 246, 0.5),
                        0 0 0 20px rgba(59, 130, 246, 0.3),
                        0 0 0 30px rgba(59, 130, 246, 0);
          }
        }

        .animate-shake {
          animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
        }

        .animate-flash {
          animation: flash 0.5s ease-in-out;
        }

        .animate-ripple {
          animation: ripple 0.6s ease-out;
        }
      `}</style>
    </div>
  );
};

// Hook for programmatic haptic feedback
export const useHapticFeedback = () => {
  const [feedback, setFeedback] = useState<{ type: FeedbackType; timestamp: number } | null>(null);

  const trigger = (type: FeedbackType) => {
    setFeedback({ type, timestamp: Date.now() });
  };

  return { feedback, trigger };
};

export default HapticFeedback;
