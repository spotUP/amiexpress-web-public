import React, { useEffect, useState } from 'react';
import { CheckCircle, Star, Zap } from 'lucide-react';

interface SuccessCelebrationProps {
  trigger: boolean;
  message?: string;
  type?: 'build' | 'game' | 'generic';
  onComplete?: () => void;
}

export const SuccessCelebration: React.FC<SuccessCelebrationProps> = ({
  trigger,
  message = 'Success!',
  type = 'generic',
  onComplete,
}) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (trigger) {
      setShow(true);
      const timeout = setTimeout(() => {
        setShow(false);
        onComplete?.();
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [trigger, onComplete]);

  if (!show) return null;

  const icons = {
    build: <Hammer className="w-16 h-16" />,
    game: <Star className="w-16 h-16" />,
    generic: <CheckCircle className="w-16 h-16" />,
  };

  const colors = {
    build: 'from-blue-500 to-cyan-500',
    game: 'from-purple-500 to-pink-500',
    generic: 'from-green-500 to-emerald-500',
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
      {/* Backdrop with fade */}
      <div className="absolute inset-0 bg-black/40 animate-fadeIn" />

      {/* Success card */}
      <div className="relative animate-bounce-in">
        <div className={`
          bg-gradient-to-br ${colors[type]} p-8 rounded-2xl shadow-2xl
          transform rotate-0 hover:rotate-3 transition-transform
        `}>
          {/* Icon with glow */}
          <div className="text-white mb-4 flex justify-center animate-pulse">
            {icons[type]}
          </div>

          {/* Message */}
          <div className="text-white text-center">
            <h3 className="text-2xl font-bold mb-2">{message}</h3>
            <p className="text-white/80">Great job! Keep it up!</p>
          </div>

          {/* Sparkle effects */}
          <div className="absolute -top-4 -right-4 animate-spin-slow">
            <Star className="w-8 h-8 text-yellow-300" fill="currentColor" />
          </div>
          <div className="absolute -bottom-4 -left-4 animate-spin-slow" style={{ animationDelay: '0.5s' }}>
            <Zap className="w-8 h-8 text-yellow-300" fill="currentColor" />
          </div>
        </div>

        {/* Glow ring */}
        <div className={`
          absolute inset-0 bg-gradient-to-br ${colors[type]} rounded-2xl blur-xl opacity-50 -z-10
          animate-pulse
        `} />
      </div>
    </div>
  );
};

// Import needed for the icon
import { Hammer } from 'lucide-react';

export default SuccessCelebration;
