import React, { useEffect, useState } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  color: string;
  size: number;
  emoji?: string;
}

interface ParticleEffectProps {
  type?: 'confetti' | 'sparkles' | 'success' | 'stars';
  trigger?: boolean;
  duration?: number;
  onComplete?: () => void;
}

export const ParticleEffect: React.FC<ParticleEffectProps> = ({
  type = 'confetti',
  trigger = false,
  duration = 3000,
  onComplete,
}) => {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!trigger) return;

    const particleCount = type === 'sparkles' ? 30 : 50;
    const newParticles: Particle[] = [];

    const colors = {
      confetti: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE'],
      sparkles: ['#FFD700', '#FFA500', '#FF69B4', '#00CED1', '#9370DB'],
      success: ['#00FF00', '#32CD32', '#00FA9A', '#7FFF00'],
      stars: ['#FFD700', '#FFA500', '#FFFF00'],
    };

    const particleColors = colors[type];
    const emojis = type === 'confetti' ? ['🎉', '🎊', '✨', '🌟', '💫'] : undefined;

    for (let i = 0; i < particleCount; i++) {
      newParticles.push({
        id: Date.now() + i,
        x: Math.random() * window.innerWidth,
        y: type === 'sparkles' ? Math.random() * window.innerHeight : -20,
        vx: (Math.random() - 0.5) * 8,
        vy: type === 'sparkles' ? (Math.random() - 0.5) * 8 : Math.random() * 5 + 2,
        rotation: Math.random() * 360,
        color: particleColors[Math.floor(Math.random() * particleColors.length)],
        size: Math.random() * 10 + 5,
        emoji: emojis ? emojis[Math.floor(Math.random() * emojis.length)] : undefined,
      });
    }

    setParticles(newParticles);

    const interval = setInterval(() => {
      setParticles((prev) =>
        prev
          .map((p) => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            vy: p.vy + 0.3, // Gravity
            rotation: p.rotation + 5,
          }))
          .filter((p) => p.y < window.innerHeight + 50)
      );
    }, 16);

    const timeout = setTimeout(() => {
      setParticles([]);
      onComplete?.();
    }, duration);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [trigger, type, duration, onComplete]);

  if (particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute transition-opacity duration-1000"
          style={{
            left: particle.x,
            top: particle.y,
            transform: `rotate(${particle.rotation}deg)`,
            opacity: Math.max(0, 1 - particle.y / window.innerHeight),
          }}
        >
          {particle.emoji ? (
            <span style={{ fontSize: particle.size * 2 }}>{particle.emoji}</span>
          ) : (
            <div
              style={{
                width: particle.size,
                height: particle.size,
                backgroundColor: particle.color,
                borderRadius: type === 'stars' ? '50%' : '0%',
                boxShadow: `0 0 ${particle.size}px ${particle.color}`,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default ParticleEffect;
