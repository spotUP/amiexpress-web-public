import { useState } from 'react';

interface AudioInputProps {
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
}

const audioExamples = [
  "Epic orchestral soundtrack for boss battles, ambient forest sounds for exploration levels, and punchy SFX for jumps and attacks. Mood should shift from tense to triumphant.",
  "Chiptune retro soundtrack with 8-bit beeps and boops. Sound effects for collecting coins, jumping, and enemy defeats. Loopable tracks under 5MB for web deployment.",
  "Ambient electronic music with synth pads and atmospheric layers. Dynamic music that speeds up during chase sequences. Include spatial audio for 3D positioning.",
  "Jazz fusion soundtrack with piano and saxophone. Smooth transitions between exploration and combat. Include UI click sounds and environmental ambience.",
  "Dark atmospheric horror soundtrack with tension-building drones. Jump scare stingers and creepy environmental sounds. Adaptive music based on player stress level."
];

function AudioInput({ value, onChange, disabled = false }: AudioInputProps) {
  const [showExamples, setShowExamples] = useState(false);

  const handleExampleClick = (example: string) => {
    onChange(example);
    setShowExamples(false);
  };

  const characterCount = value.length;
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const minLength = 50;
  const isValid = characterCount >= minLength;

  return (
    <div className="prompt-input-container">
      <div className="prompt-label">
        <h2>Describe Your Game's Audio</h2>
        <p className="prompt-hint">
          Describe the music, sound effects, and audio atmosphere you envision for your game.
          Include details about mood, genre, pacing, and integration with gameplay.
        </p>
      </div>

      <textarea
        className="prompt-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={8}
        placeholder="Example: Epic orchestral soundtrack for boss battles, ambient forest sounds for exploration levels, and punchy SFX for jumps and attacks. Mood should shift from tense to triumphant. Include dynamic music that speeds up during chases. Loopable tracks under 5MB for web deployment. Add subtitles for voice lines and adjustable volume levels for accessibility."
      />

      <div className="prompt-info">
        <span className={isValid ? 'text-success' : 'text-muted'}>
          {characterCount} characters, {wordCount} words
          {!isValid && ` (${minLength - characterCount} more needed)`}
        </span>
        <button
          className="btn-link"
          onClick={() => setShowExamples(!showExamples)}
          type="button"
        >
          {showExamples ? 'Hide Examples' : 'Show Examples'}
        </button>
      </div>

      {showExamples && (
        <div className="examples-panel">
          <h3>Example Audio Descriptions</h3>
          <p className="examples-hint">
            Click any example to use it as a starting point for your audio description:
          </p>
          <div className="examples-list">
            {audioExamples.map((example, index) => (
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

export default AudioInput;
