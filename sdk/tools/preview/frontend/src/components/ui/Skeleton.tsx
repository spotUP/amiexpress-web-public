import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rectangular',
  width,
  height,
  animation = 'pulse',
}) => {
  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer',
    none: '',
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`bg-gray-700 ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
      style={style}
    />
  );
};

export const DoorCardSkeleton: React.FC = () => {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
      <div className="flex items-start gap-3">
        <Skeleton variant="rectangular" width={48} height={48} />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="60%" height={16} />
          <Skeleton variant="text" width="90%" height={12} />
          <Skeleton variant="text" width="40%" height={12} />
        </div>
      </div>
    </div>
  );
};

export const DoorListSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => {
  return (
    <div className="p-2 space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <DoorCardSkeleton key={i} />
      ))}
    </div>
  );
};

export const CodeEditorSkeleton: React.FC = () => {
  return (
    <div className="h-full p-4 space-y-3">
      <div className="space-y-2">
        {Array.from({ length: 15 }).map((_, i) => (
          <Skeleton
            key={i}
            variant="text"
            width={`${Math.random() * 40 + 50}%`}
            height={12}
          />
        ))}
      </div>
    </div>
  );
};

export const MetadataSkeleton: React.FC = () => {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton variant="text" width="30%" height={14} className="mb-2" />
        <Skeleton variant="text" width="80%" height={16} />
      </div>
      <div>
        <Skeleton variant="text" width="30%" height={14} className="mb-2" />
        <Skeleton variant="text" width="60%" height={16} />
      </div>
      <div>
        <Skeleton variant="text" width="30%" height={14} className="mb-2" />
        <Skeleton variant="text" width="70%" height={16} />
      </div>
      <div>
        <Skeleton variant="rectangular" width="100%" height={100} />
      </div>
    </div>
  );
};
