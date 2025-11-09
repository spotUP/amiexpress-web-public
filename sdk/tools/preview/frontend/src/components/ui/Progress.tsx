import React from 'react';
import { CheckCircle, Loader2, Circle } from 'lucide-react';

export interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  duration?: number;
}

interface ProgressBarProps {
  progress: number;
  className?: string;
  showPercentage?: boolean;
  indeterminate?: boolean;
  color?: 'blue' | 'green' | 'purple' | 'yellow' | 'red';
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  className = '',
  showPercentage = true,
  indeterminate = false,
  color = 'blue',
}) => {
  const colorClasses = {
    blue: 'bg-blue-600',
    green: 'bg-green-600',
    purple: 'bg-purple-600',
    yellow: 'bg-yellow-600',
    red: 'bg-red-600',
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        {showPercentage && (
          <span className="text-xs text-gray-400">
            {indeterminate ? 'Processing...' : `${Math.round(progress)}%`}
          </span>
        )}
      </div>
      <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${colorClasses[color]} ${
            indeterminate ? 'animate-progress-indeterminate' : ''
          }`}
          style={{ width: indeterminate ? '30%' : `${progress}%` }}
        />
      </div>
    </div>
  );
};

interface StepProgressProps {
  steps: ProgressStep[];
  currentStep?: number;
  className?: string;
}

export const StepProgress: React.FC<StepProgressProps> = ({
  steps,
  currentStep,
  className = '',
}) => {
  const getStepIcon = (step: ProgressStep, index: number) => {
    switch (step.status) {
      case 'complete':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'running':
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      case 'error':
        return <Circle className="w-5 h-5 text-red-400 fill-red-400" />;
      default:
        return (
          <Circle
            className={`w-5 h-5 ${
              currentStep !== undefined && index <= currentStep
                ? 'text-gray-500'
                : 'text-gray-700'
            }`}
          />
        );
    }
  };

  const getStepColor = (step: ProgressStep) => {
    switch (step.status) {
      case 'complete':
        return 'text-green-400';
      case 'running':
        return 'text-blue-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center gap-3">
          {getStepIcon(step, index)}
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className={`text-sm font-medium ${getStepColor(step)}`}>
                {step.label}
              </span>
              {step.duration && step.status === 'complete' && (
                <span className="text-xs text-gray-500">{step.duration}ms</span>
              )}
            </div>
            {step.status === 'running' && (
              <div className="mt-1 w-full h-1 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 animate-progress-indeterminate" />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

interface CircularProgressProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  showPercentage?: boolean;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  progress,
  size = 120,
  strokeWidth = 8,
  color = '#3B82F6',
  showPercentage = true,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-gray-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-300"
        />
      </svg>
      {showPercentage && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold text-white">{Math.round(progress)}%</span>
        </div>
      )}
    </div>
  );
};
