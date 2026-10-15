import { useState } from 'react';
import { QuestionStep } from '../../types/wizard';

interface QuestionFlowProps {
  questions: QuestionStep[];
  currentIndex: number;
  answers: Record<string, any>;
  onAnswer: (questionId: string, answer: any) => void;
  onNext: () => void;
  onSkip: () => void;
}

function QuestionFlow({ questions, currentIndex, answers, onAnswer, onNext, onSkip }: QuestionFlowProps) {
  const currentQuestion = questions[currentIndex];
  const [tempAnswer, setTempAnswer] = useState<any>(answers[currentQuestion?.id] || currentQuestion?.defaultValue);

  if (!currentQuestion) {
    return (
      <div className="question-flow">
        <p>No questions available.</p>
        <button className="btn btn-primary" onClick={onSkip}>
          Continue to Generation
        </button>
      </div>
    );
  }

  const handleAnswer = (value: any) => {
    if (currentQuestion.type === 'multi-choice') {
      // Toggle value in array
      const current = Array.isArray(tempAnswer) ? tempAnswer : [];
      const newAnswer = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      setTempAnswer(newAnswer);
      onAnswer(currentQuestion.id, newAnswer);
    } else {
      setTempAnswer(value);
      onAnswer(currentQuestion.id, value);
    }
  };

  const handleNext = () => {
    onAnswer(currentQuestion.id, tempAnswer);
    onNext();
  };

  const isAnswered = tempAnswer !== undefined &&
    (Array.isArray(tempAnswer) ? tempAnswer.length > 0 : tempAnswer !== '');

  return (
    <div className="question-flow">
      <div className="question-header">
        <div className="question-progress">
          Question {currentIndex + 1} of {questions.length}
        </div>
        <div className="question-importance">
          <span className={`importance-badge ${currentQuestion.importance}`}>
            {currentQuestion.importance}
          </span>
        </div>
      </div>

      <div className="question-content">
        <h2>{currentQuestion.question}</h2>
        {currentQuestion.description && (
          <p className="question-description">{currentQuestion.description}</p>
        )}

        <div className="question-options">
          {currentQuestion.type === 'single-choice' && (
            <div className="options-grid single-choice">
              {currentQuestion.options?.map(option => (
                <button
                  key={option.value}
                  className={`option-btn ${tempAnswer === option.value ? 'selected' : ''}`}
                  onClick={() => handleAnswer(option.value)}
                >
                  <div className="option-label">{option.label}</div>
                  {option.description && (
                    <div className="option-description">{option.description}</div>
                  )}
                </button>
              ))}
            </div>
          )}

          {currentQuestion.type === 'multi-choice' && (
            <div className="options-grid multi-choice">
              {currentQuestion.options?.map(option => {
                const selected = Array.isArray(tempAnswer) && tempAnswer.includes(option.value);
                return (
                  <button
                    key={option.value}
                    className={`option-btn ${selected ? 'selected' : ''}`}
                    onClick={() => handleAnswer(option.value)}
                  >
                    <div className="option-checkbox">
                      {selected && <span>✓</span>}
                    </div>
                    <div className="option-label">{option.label}</div>
                    {option.description && (
                      <div className="option-description">{option.description}</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {currentQuestion.type === 'text' && (
            <div className="text-input-container">
              <textarea
                className="text-input"
                value={tempAnswer || ''}
                onChange={(e) => handleAnswer(e.target.value)}
                placeholder="Enter your answer..."
                rows={4}
              />
            </div>
          )}

          {currentQuestion.type === 'slider' && (
            <div className="slider-container">
              <input
                type="range"
                className="slider-input"
                min={0}
                max={100}
                value={tempAnswer || 50}
                onChange={(e) => handleAnswer(parseInt(e.target.value))}
              />
              <div className="slider-value">{tempAnswer || 50}</div>
            </div>
          )}

          {currentQuestion.type === 'toggle' && (
            <div className="toggle-container">
              <button
                className={`toggle-btn ${tempAnswer ? 'active' : ''}`}
                onClick={() => handleAnswer(!tempAnswer)}
              >
                <span className="toggle-switch">
                  <span className={`toggle-slider ${tempAnswer ? 'on' : 'off'}`} />
                </span>
                <span className="toggle-label">
                  {tempAnswer ? 'Yes' : 'No'}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="question-actions">
        <button
          className="btn btn-primary btn-large"
          onClick={handleNext}
          disabled={!isAnswered}
        >
          {currentIndex < questions.length - 1 ? 'Next Question' : 'Complete Review'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleNext}
        >
          Skip This Question
        </button>
        <button
          className="btn btn-ghost"
          onClick={onSkip}
        >
          Skip to Game Generation
        </button>
      </div>

      <div className="question-footer">
        <div className="answered-count">
          Answered: {Object.keys(answers).length} / {questions.length}
        </div>
      </div>
    </div>
  );
}

export default QuestionFlow;
