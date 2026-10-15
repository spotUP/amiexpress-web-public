interface ProgressBarProps {
  step: 'input' | 'enhance' | 'review' | 'audio' | 'audio-review' | 'customize' | 'generate';
  totalSteps?: number;
  currentStep?: number;
}

const stepLabels = {
  input: 'Game Prompt',
  enhance: 'Enhance Prompt',
  review: 'Game Review',
  audio: 'Audio Design',
  'audio-review': 'Audio Review',
  customize: 'Customization',
  generate: 'Generate'
};

function ProgressBar({ step, totalSteps = 0, currentStep = 0 }: ProgressBarProps) {
  const steps = ['input', 'review', 'audio', 'audio-review', 'generate'] as const;

  // Map current step to step index, handling intermediate steps
  const getStepIndex = () => {
    if (step === 'enhance') return 0; // Enhance is part of input
    return steps.indexOf(step as any);
  };

  const currentStepIndex = getStepIndex();

  const getStepClass = (index: number) => {
    if (index < currentStepIndex) return 'completed';
    if (index === currentStepIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="progress-bar-container">
      <div className="progress-steps">
        {steps.map((s, index) => (
          <div key={s} className={`progress-step ${getStepClass(index)}`}>
            <div className="step-marker">
              {index < currentStepIndex ? (
                <span className="step-check">✓</span>
              ) : (
                <span className="step-number">{index + 1}</span>
              )}
            </div>
            <div className="step-label">{stepLabels[s]}</div>
            {index < steps.length - 1 && <div className="step-connector" />}
          </div>
        ))}
      </div>

      {(step === 'review' || step === 'audio-review') && totalSteps > 0 && (
        <div className="substep-progress">
          <div className="substep-bar">
            <div
              className="substep-fill"
              style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
            />
          </div>
          <div className="substep-text">
            Question {currentStep + 1} of {totalSteps}
          </div>
        </div>
      )}
    </div>
  );
}

export default ProgressBar;
