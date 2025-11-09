import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';

interface TourStep {
  id: string;
  title: string;
  description: string;
  target?: string; // CSS selector
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  icon?: React.ReactNode;
}

interface OnboardingTourProps {
  steps: TourStep[];
  onComplete: () => void;
  onSkip: () => void;
  autoStart?: boolean;
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({
  steps,
  onComplete,
  onSkip,
  autoStart = true,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isActive, setIsActive] = useState(autoStart);
  const [highlightPosition, setHighlightPosition] = useState<DOMRect | null>(null);

  const step = steps[currentStep];

  useEffect(() => {
    if (!isActive || !step.target) return;

    const element = document.querySelector(step.target);
    if (element) {
      const rect = element.getBoundingClientRect();
      setHighlightPosition(rect);
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentStep, isActive, step]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    setIsActive(false);
    onComplete();
  };

  const handleSkip = () => {
    setIsActive(false);
    onSkip();
  };

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 z-[10000]">
      {/* Dark overlay with spotlight */}
      <div className="absolute inset-0 bg-black/70 animate-fadeIn" onClick={handleSkip}>
        {/* Spotlight cutout */}
        {highlightPosition && (
          <div
            className="absolute transition-all duration-300"
            style={{
              top: highlightPosition.top - 8,
              left: highlightPosition.left - 8,
              width: highlightPosition.width + 16,
              height: highlightPosition.height + 16,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.7), 0 0 20px 4px rgba(59, 130, 246, 0.5)',
              borderRadius: '8px',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>

      {/* Tour card */}
      <div
        className={`absolute bg-gray-900 rounded-lg shadow-2xl border border-gray-700 p-6 w-96 animate-bounce-in`}
        style={{
          top: highlightPosition
            ? step.position === 'bottom'
              ? highlightPosition.bottom + 20
              : step.position === 'top'
              ? highlightPosition.top - 220
              : '50%'
            : '50%',
          left: highlightPosition
            ? step.position === 'right'
              ? highlightPosition.right + 20
              : step.position === 'left'
              ? highlightPosition.left - 420
              : highlightPosition.left
            : '50%',
          transform: !highlightPosition || step.position === 'center' ? 'translate(-50%, -50%)' : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon */}
        {step.icon && (
          <div className="mb-4 text-blue-500">
            {step.icon}
          </div>
        )}

        {/* Content */}
        <h3 className="text-xl font-bold text-white mb-2">{step.title}</h3>
        <p className="text-gray-400 mb-6">{step.description}</p>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {steps.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStep(index)}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentStep
                  ? 'bg-blue-500 w-8'
                  : index < currentStep
                  ? 'bg-green-500'
                  : 'bg-gray-600'
              }`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          <span className="text-sm text-gray-500">
            {currentStep + 1} / {steps.length}
          </span>

          <button
            onClick={handleNext}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            {currentStep === steps.length - 1 ? (
              <>
                Finish
                <CheckCircle className="w-4 h-4" />
              </>
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingTour;
