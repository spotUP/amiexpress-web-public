import React from 'react';

interface GradientMeshProps {
  variant?: 'subtle' | 'vibrant' | 'dark';
  animated?: boolean;
  className?: string;
}

export const GradientMesh: React.FC<GradientMeshProps> = ({
  variant = 'subtle',
  animated = true,
  className = '',
}) => {
  const variants = {
    subtle: {
      colors: ['rgba(59, 130, 246, 0.1)', 'rgba(139, 92, 246, 0.1)', 'rgba(236, 72, 153, 0.1)'],
      blur: '60px',
    },
    vibrant: {
      colors: ['rgba(59, 130, 246, 0.2)', 'rgba(139, 92, 246, 0.2)', 'rgba(236, 72, 153, 0.2)'],
      blur: '80px',
    },
    dark: {
      colors: ['rgba(30, 58, 138, 0.15)', 'rgba(88, 28, 135, 0.15)', 'rgba(159, 18, 57, 0.15)'],
      blur: '100px',
    },
  };

  const config = variants[variant];

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {/* Gradient orbs */}
      <div
        className={`absolute w-96 h-96 rounded-full ${animated ? 'animate-float' : ''}`}
        style={{
          background: `radial-gradient(circle, ${config.colors[0]} 0%, transparent 70%)`,
          filter: `blur(${config.blur})`,
          top: '10%',
          left: '10%',
          animation: animated ? 'float 20s ease-in-out infinite' : undefined,
        }}
      />
      <div
        className={`absolute w-80 h-80 rounded-full ${animated ? 'animate-float-delayed' : ''}`}
        style={{
          background: `radial-gradient(circle, ${config.colors[1]} 0%, transparent 70%)`,
          filter: `blur(${config.blur})`,
          top: '40%',
          right: '10%',
          animation: animated ? 'float 25s ease-in-out infinite 5s' : undefined,
        }}
      />
      <div
        className={`absolute w-72 h-72 rounded-full ${animated ? 'animate-float' : ''}`}
        style={{
          background: `radial-gradient(circle, ${config.colors[2]} 0%, transparent 70%)`,
          filter: `blur(${config.blur})`,
          bottom: '10%',
          left: '30%',
          animation: animated ? 'float 30s ease-in-out infinite 10s' : undefined,
        }}
      />

      {/* Noise texture overlay for depth */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' /%3E%3C/svg%3E")`,
        }}
      />

      <style>{`
        @keyframes float {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(30px, -30px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }

        @keyframes float-delayed {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(-30px, 30px) scale(0.9);
          }
          66% {
            transform: translate(20px, -20px) scale(1.1);
          }
        }

        .animate-float {
          animation: float 20s ease-in-out infinite;
        }

        .animate-float-delayed {
          animation: float-delayed 25s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default GradientMesh;
