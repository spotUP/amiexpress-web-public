import { useState } from 'react';

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const examplePrompts = [
  'Create a space adventure where players pilot ships through asteroid fields, battling alien invaders with customizable weapons and upgrades.',
  'Design a roguelike dungeon crawler with procedural generation, turn-based combat, and permanent death.',
  'Build a puzzle platformer with physics-based interactions, environmental puzzles, and collectible secrets.',
  'Create a card battler with deck building mechanics, strategic resource management, and multiplayer battles.',
  'Design a mystery detective game where players gather clues, interview suspects, and solve crimes through deduction.'
];

function PromptInput({ value, onChange, disabled }: PromptInputProps) {
  const [showExamples, setShowExamples] = useState(false);

  const handleExampleClick = (example: string) => {
    onChange(example);
    setShowExamples(false);
  };

  return (
    <div className="prompt-input-container">
      <label htmlFor="game-prompt" className="prompt-label">
        <h2>Describe Your Game</h2>
        <p className="prompt-hint">
          Be as detailed or as brief as you like. The AI will help enhance your description.
        </p>
      </label>

      <textarea
        id="game-prompt"
        className="prompt-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Example: Create a space shooter where players pilot customizable spacecraft through asteroid fields, battling waves of alien invaders. Include power-ups, boss battles, and a ship upgrade system. Use colorful ANSI graphics with smooth animations."
        rows={12}
      />

      <div className="prompt-info">
        <span className="char-count">
          {value.length} characters {value.length < 50 && '(minimum 50 recommended)'}
        </span>
        <button
          type="button"
          className="btn btn-link"
          onClick={() => setShowExamples(!showExamples)}
        >
          {showExamples ? 'Hide Examples' : 'Show Examples'}
        </button>
      </div>

      {showExamples && (
        <div className="examples-panel">
          <h3>Example Game Prompts</h3>
          <p className="examples-hint">Click any example to use it as a starting point:</p>
          <div className="examples-list">
            {examplePrompts.map((example, index) => (
              <div
                key={index}
                className="example-item"
                onClick={() => handleExampleClick(example)}
              >
                <div className="example-number">{index + 1}</div>
                <div className="example-text">{example}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default PromptInput;
