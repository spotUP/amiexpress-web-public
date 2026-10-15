import { useState, useRef, useEffect } from 'react';

interface SmileyPickerProps {
  onSelect: (smiley: string) => void;
}

interface SmileyCategory {
  name: string;
  smileys: { text: string; label: string }[];
}

const smileyCategories: SmileyCategory[] = [
  {
    name: 'Happy',
    smileys: [
      { text: ':)', label: 'smile' },
      { text: ':D', label: 'grin' },
      { text: ':-)', label: 'happy' },
      { text: ';)', label: 'wink' },
      { text: ';-)', label: 'wink alt' },
      { text: ':P', label: 'tongue' },
      { text: ':-P', label: 'tongue alt' },
      { text: 'XD', label: 'laughing' },
      { text: '^_^', label: 'anime smile' },
      { text: '^.^', label: 'cute' },
      { text: '=)', label: 'equal smile' },
      { text: '=D', label: 'equal grin' },
    ],
  },
  {
    name: 'Sad',
    smileys: [
      { text: ':(', label: 'sad' },
      { text: ':-(', label: 'sad alt' },
      { text: ":'(", label: 'crying' },
      { text: 'T_T', label: 'tears' },
      { text: 'ToT', label: 'crying face' },
      { text: '>.<', label: 'frustrated' },
      { text: '-_-', label: 'annoyed' },
      { text: '._.' , label: 'blank' },
    ],
  },
  {
    name: 'Surprised',
    smileys: [
      { text: ':O', label: 'surprised' },
      { text: ':-O', label: 'surprised alt' },
      { text: ':o', label: 'oh' },
      { text: 'O_O', label: 'shocked' },
      { text: 'O.O', label: 'wide eyes' },
      { text: 'o.o', label: 'curious' },
      { text: '0_0', label: 'stunned' },
      { text: 'D:', label: 'dismay' },
    ],
  },
  {
    name: 'Cool',
    smileys: [
      { text: 'B)', label: 'cool' },
      { text: '8)', label: 'sunglasses' },
      { text: '8-)', label: 'cool alt' },
      { text: 'B-)', label: 'shades' },
      { text: '=B', label: 'buck teeth' },
    ],
  },
  {
    name: 'Love',
    smileys: [
      { text: '<3', label: 'heart' },
      { text: '</3', label: 'broken heart' },
      { text: ':*', label: 'kiss' },
      { text: ':-*', label: 'kiss alt' },
      { text: ';*', label: 'wink kiss' },
      { text: 'xoxo', label: 'hugs kisses' },
    ],
  },
  {
    name: 'Fun',
    smileys: [
      { text: ':|', label: 'neutral' },
      { text: ':-|', label: 'neutral alt' },
      { text: ':/', label: 'unsure' },
      { text: ':-/', label: 'unsure alt' },
      { text: ':\\', label: 'skeptical' },
      { text: '>:)', label: 'evil grin' },
      { text: '>:D', label: 'evil laugh' },
      { text: '>:(', label: 'angry' },
      { text: ']:)', label: 'devil' },
      { text: 'o/', label: 'wave' },
      { text: '\\o/', label: 'cheer' },
      { text: '\\m/', label: 'rock on' },
    ],
  },
  {
    name: 'Classic',
    smileys: [
      { text: ':-]', label: 'bracket smile' },
      { text: ':-[', label: 'bracket frown' },
      { text: ':3', label: 'cat face' },
      { text: 'uwu', label: 'uwu' },
      { text: 'OwO', label: 'owo' },
      { text: '@_@', label: 'dizzy' },
      { text: '$_$', label: 'money eyes' },
      { text: '*_*', label: 'starry eyed' },
      { text: '~_~', label: 'sleepy' },
      { text: '-.-', label: 'unimpressed' },
      { text: '(>_<)', label: 'cringe' },
      { text: '(^o^)', label: 'excited' },
    ],
  },
  {
    name: 'Kaomoji',
    smileys: [
      { text: '(._. )', label: 'shy' },
      { text: '( ^_^)/', label: 'wave hi' },
      { text: '\\(^o^)/', label: 'yay' },
      { text: '(T_T)', label: 'sad cry' },
      { text: '(*^_^*)', label: 'blushing' },
      { text: '(o_o)', label: 'stare' },
      { text: '(-_-)', label: 'bored' },
      { text: '(^_~)', label: 'winking' },
      { text: '(@_@)', label: 'confused' },
      { text: '(#^.^#)', label: 'embarrassed' },
      { text: '(;_;)', label: 'teary' },
      { text: '\\(o_o)/', label: 'dunno' },
    ],
  },
  {
    name: 'Shrug & Actions',
    smileys: [
      { text: '\\_(o.o)_/', label: 'shrug' },
      { text: '(shrug)', label: 'shrug text' },
      { text: '(facepalm)', label: 'facepalm' },
      { text: '(thumbsup)', label: 'thumbs up' },
      { text: '(wave)', label: 'wave' },
      { text: '/me', label: 'action' },
    ],
  },
];

export function SmileyPicker({ onSelect }: SmileyPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isOpen) return;

      if (event.key === 'Escape') {
        setIsOpen(false);
      } else if (event.key === 'ArrowLeft') {
        setSelectedCategory((prev) => (prev > 0 ? prev - 1 : smileyCategories.length - 1));
      } else if (event.key === 'ArrowRight') {
        setSelectedCategory((prev) => (prev < smileyCategories.length - 1 ? prev + 1 : 0));
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  const handleSmileyClick = (smiley: string) => {
    onSelect(smiley);
    setIsOpen(false);
  };

  return (
    <div ref={pickerRef} className="relative inline-block">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="px-2 py-1 text-sm font-mono bg-surface-2 hover:bg-surface-3 text-status-warn rounded border border-border-strong transition-colors"
        title="Insert ASCII smiley"
      >
        [:)]
      </button>

      {/* Picker Modal */}
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-80 bg-surface-1 border border-border-strong rounded-lg shadow-xl z-50">
          {/* Category Tabs */}
          <div className="flex flex-wrap gap-1 p-2 border-b border-border bg-surface-0 rounded-t-lg">
            {smileyCategories.map((category, index) => (
              <button
                key={category.name}
                onClick={() => setSelectedCategory(index)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  selectedCategory === index
                    ? 'bg-status-ok text-content-inverse'
                    : 'bg-surface-2 text-content-secondary hover:bg-surface-3'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>

          {/* Smiley Grid */}
          <div className="p-2 max-h-48 overflow-y-auto">
            <div className="grid grid-cols-4 gap-1">
              {smileyCategories[selectedCategory].smileys.map((smiley) => (
                <button
                  key={smiley.text}
                  onClick={() => handleSmileyClick(smiley.text)}
                  className="p-2 text-center font-mono text-lg bg-surface-2 hover:bg-surface-3 rounded transition-colors group relative"
                  title={smiley.label}
                >
                  <span className="text-status-warn">{smiley.text}</span>
                  {/* Tooltip */}
                  <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 text-xs bg-surface-0 text-content-secondary rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    {smiley.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Footer hint */}
          <div className="px-2 py-1 text-xs text-content-muted border-t border-border bg-surface-0 rounded-b-lg">
            Click to insert | Arrow keys to switch categories | Esc to close
          </div>
        </div>
      )}
    </div>
  );
}
