import { AudioTemplate } from '../types/wizard';

export const audioTemplates: AudioTemplate[] = [
  {
    id: 'synthwave-retro',
    name: 'Synthwave Retro Soundtrack',
    category: 'Electronic',
    description: 'Nostalgic 80s-inspired electronic music with neon vibes',
    exampleDescription: 'Synthwave retro soundtrack with lush analog synths, driving basslines, and reverb-soaked drums. Evokes the atmosphere of neon-lit streets and arcade games. Include pulsing arpeggios, gated snare drums, and warm pad sounds. Music should build energy during action sequences and mellow out during exploration. Add retro UI beeps and boops, whoosh transitions, and pixelated explosion sounds. Loopable tracks optimized for web (under 3MB each). Include volume controls and tempo adjustments for player preference.',
    tags: ['synthwave', 'retro', '80s', 'electronic', 'neon'],
    metadata: {
      musicStyle: ['synthwave', 'electronic', 'retro'],
      soundEffects: ['UI sounds', 'retro beeps', 'whoosh transitions'],
      moodProgression: 'Energetic to mellow with dynamic shifts',
      integration: ['Dynamic music changes', 'Contextual SFX variations'],
      technicalNeeds: ['Optimize for mobile', 'Loopable tracks under 3MB'],
      accessibility: ['Volume controls', 'Tempo adjustments'],
      volumeBalance: 70,
      tempoAdjustment: 60,
      audioLength: 'Medium (2-4 minutes per track)',
      licensing: 'Royalty-free',
      voiceActing: false
    }
  },
  {
    id: 'ambient-nature',
    name: 'Ambient Nature Exploration',
    category: 'Ambient',
    description: 'Peaceful environmental soundscapes for exploration games',
    exampleDescription: 'Ambient nature soundtrack featuring gentle wind chimes, rustling leaves, flowing water, and distant bird calls. Create a serene, meditative atmosphere perfect for exploration and puzzle-solving. Layer environmental sounds with subtle musical drones and organic textures. Include spatial audio for realistic 3D positioning of environmental sounds. Dynamic transitions as player moves between forest, cave, and riverside areas. Minimal UI sounds that blend with nature (soft clicks, nature-inspired notifications). Adjust intensity based on time of day and weather. Include audio descriptions for visually impaired players. All tracks under 5MB for web compatibility.',
    tags: ['ambient', 'nature', 'exploration', 'peaceful', 'meditative'],
    metadata: {
      musicStyle: ['ambient', 'environmental', 'organic'],
      soundEffects: ['Environmental noises', 'spatial audio', 'nature sounds'],
      moodProgression: 'Calm and consistent with subtle variations',
      integration: ['Dynamic music changes', 'Contextual SFX variations', 'Spatial audio'],
      technicalNeeds: ['Optimize for mobile', 'Spatial audio support'],
      accessibility: ['Audio cues', 'Audio descriptions', 'Volume controls'],
      volumeBalance: 50,
      tempoAdjustment: 40,
      audioLength: 'Long (5+ minutes per track for seamless loops)',
      licensing: 'Royalty-free',
      voiceActing: false
    }
  },
  {
    id: 'intense-battle-orchestral',
    name: 'Intense Battle Orchestral',
    category: 'Orchestral',
    description: 'Epic cinematic music for combat and boss battles',
    exampleDescription: 'Epic orchestral soundtrack for intense combat featuring full string sections, powerful brass fanfares, thunderous percussion, and soaring melodies. Music builds tension with ostinato patterns and crescendos to triumphant peaks. Boss battle themes should be memorable and motivating. Include dynamic layers that add/remove based on combat intensity - quiet during stealth, building during combat, explosive during critical moments. Heavy percussion and impact sounds for attacks, brass stabs for enemy attacks, string runs for dodges. Cinematic victory stingers and defeat transitions. Leitmotifs that evolve throughout the game. Include subtitles for any vocal elements. Optimized for streaming with adaptive bitrate.',
    tags: ['orchestral', 'epic', 'battle', 'cinematic', 'intense'],
    metadata: {
      musicStyle: ['orchestral', 'cinematic', 'epic'],
      soundEffects: ['Combat impacts', 'Victory stingers', 'Dynamic layers'],
      moodProgression: 'Tension building to triumphant climax',
      integration: ['Dynamic music changes', 'Combat intensity layers', 'Contextual SFX variations'],
      technicalNeeds: ['Adaptive bitrate streaming', 'Dynamic layer mixing'],
      accessibility: ['Subtitles', 'Volume controls', 'Separate music/SFX sliders'],
      volumeBalance: 80,
      tempoAdjustment: 75,
      audioLength: 'Medium (3-5 minutes with loop points)',
      licensing: 'Custom composition',
      voiceActing: false
    }
  },
  {
    id: 'chiptune-8bit',
    name: 'Chiptune 8-Bit Classic',
    category: 'Chiptune',
    description: 'Authentic retro game sounds from the 8-bit era',
    exampleDescription: 'Authentic chiptune soundtrack using classic 8-bit waveforms (square, triangle, noise). Catchy melodic hooks with limited channels (4-5 voices). Fast-paced upbeat tracks for action, slower melodic pieces for menus and story. Include classic SFX: jump sound (rising pitch), coin collect (short arpeggio), power-up (ascending fanfare), death (descending chromatic), menu navigation (single blip). Extremely small file sizes (under 1MB) using procedural generation where possible. Support for playback on low-end devices. Optional: include MIDI versions for custom synthesis. Volume normalization for consistent levels across all sounds.',
    tags: ['chiptune', '8-bit', 'retro', 'gameboy', 'nes'],
    metadata: {
      musicStyle: ['chiptune', '8-bit', 'retro'],
      soundEffects: ['Classic 8-bit SFX', 'Procedurally generated', 'UI sounds'],
      moodProgression: 'Upbeat and energetic',
      integration: ['Procedural generation', 'MIDI synthesis'],
      technicalNeeds: ['Optimize for mobile', 'Tiny file sizes (under 1MB)', 'Low-end device support'],
      accessibility: ['Volume controls', 'Mute option'],
      volumeBalance: 65,
      tempoAdjustment: 80,
      audioLength: 'Short loops (30-90 seconds)',
      licensing: 'Royalty-free',
      voiceActing: false
    }
  },
  {
    id: 'horror-atmospheric',
    name: 'Horror Atmospheric Tension',
    category: 'Horror',
    description: 'Dark, unsettling soundscapes for horror experiences',
    exampleDescription: 'Dark atmospheric horror soundtrack with tension-building drones, dissonant harmonies, and unsettling textures. Use of reversed sounds, pitch-shifted samples, and binaural audio for immersive 3D positioning. Subtle ambient layers that create unease without jump scares. Dynamic intensity system that responds to player stress level - quiet breathing sounds when hiding, heartbeat increases during chases, distorted audio during sanity loss. Jump scare stingers (sudden loud sounds) used sparingly. Environmental sounds: creaking doors, distant footsteps, whispers, wind howling. Minimal music during gameplay, emphasizing sound design. Include warning for loud sounds and option to reduce jump scares for accessibility. Spatial audio essential for directional threats.',
    tags: ['horror', 'atmospheric', 'dark', 'tension', 'scary'],
    metadata: {
      musicStyle: ['atmospheric', 'drone', 'dark ambient'],
      soundEffects: ['Jump scares', 'Environmental horror', 'Binaural audio', 'Spatial audio'],
      moodProgression: 'Building tension with dynamic intensity',
      integration: ['Dynamic music changes', 'Stress-based audio', 'Spatial audio'],
      technicalNeeds: ['Binaural audio support', 'Dynamic mixing', 'Spatial audio'],
      accessibility: ['Jump scare warnings', 'Reduce intensity option', 'Volume controls', 'Audio cues'],
      volumeBalance: 60,
      tempoAdjustment: 50,
      audioLength: 'Long ambient tracks (8+ minutes)',
      licensing: 'Royalty-free',
      voiceActing: false
    }
  },
  {
    id: 'jazz-fusion-smooth',
    name: 'Jazz Fusion Smooth Grooves',
    category: 'Jazz',
    description: 'Sophisticated jazz soundtrack with smooth improvisational feel',
    exampleDescription: 'Jazz fusion soundtrack featuring piano, saxophone, upright bass, and brushed drums. Sophisticated harmonies with modal interchange and extended chords. Smooth transitions between exploration (laid-back swing) and combat (uptempo bebop). Include improvisational solos that add variety to loops without becoming repetitive. Environmental sounds blend with music - city ambience, cafe chatter, rain on windows. UI sounds use jazzy chord stabs and piano notes. Dynamic arrangements that thin out to trio during dialogue and swell to full band during action. High-quality samples or live recordings for authentic sound. Include sheet music mode for music students. Accessibility features for tempo and instrument isolation.',
    tags: ['jazz', 'fusion', 'smooth', 'sophisticated', 'instrumental'],
    metadata: {
      musicStyle: ['jazz', 'fusion', 'bebop', 'swing'],
      soundEffects: ['UI sounds', 'Environmental ambience', 'Chord stabs'],
      moodProgression: 'Sophisticated with dynamic energy shifts',
      integration: ['Dynamic music changes', 'Contextual arrangements'],
      technicalNeeds: ['High-quality samples', 'Dynamic arrangement layers'],
      accessibility: ['Tempo controls', 'Instrument isolation', 'Volume controls'],
      volumeBalance: 55,
      tempoAdjustment: 65,
      audioLength: 'Medium-long (4-7 minutes with variations)',
      licensing: 'Custom composition or licensed',
      voiceActing: false
    }
  },
  {
    id: 'electronic-action',
    name: 'Electronic High-Energy Action',
    category: 'Electronic',
    description: 'Fast-paced electronic music for intense action sequences',
    exampleDescription: 'High-energy electronic soundtrack with driving beats, aggressive bass, and intense build-ups. BPM around 140-160 for fast-paced action. Use of side-chain compression, risers, and drops for dramatic moments. Glitch effects and stutter edits add urgency. Combat SFX: heavy kicks for punches, laser zaps for projectiles, whooshes for dodges, dubstep-style bass drops for special moves. Dynamic music system adds layers as combo multiplier increases. Include bullet-time slowdown effect that pitch-shifts music. Adrenaline-pumping drops synchronized with key gameplay moments. Optimized for rhythm-based gameplay with tight synchronization. BPM-locked SFX for perfect timing. Visualizer integration for music-reactive graphics.',
    tags: ['electronic', 'action', 'high-energy', 'edm', 'dubstep'],
    metadata: {
      musicStyle: ['electronic', 'EDM', 'dubstep', 'glitch'],
      soundEffects: ['Combat impacts', 'Laser zaps', 'Whooshes', 'Bass drops'],
      moodProgression: 'Intense energy with dynamic build-ups',
      integration: ['Dynamic music changes', 'Combo-based layers', 'Rhythm synchronization'],
      technicalNeeds: ['BPM synchronization', 'Tight timing', 'Visualizer integration'],
      accessibility: ['Volume controls', 'Visual rhythm indicators', 'Photosensitivity warnings'],
      volumeBalance: 85,
      tempoAdjustment: 90,
      audioLength: 'Medium (3-4 minutes with loop points)',
      licensing: 'Royalty-free or custom',
      voiceActing: false
    }
  },
  {
    id: 'minimal-puzzle',
    name: 'Minimal Puzzle Ambience',
    category: 'Minimal',
    description: 'Subtle, non-intrusive sounds for puzzle and strategy games',
    exampleDescription: 'Minimal ambient soundtrack designed not to distract from puzzle-solving. Gentle sustained tones, soft piano notes, and subtle textures. Long, slow-evolving pads that create atmosphere without demanding attention. UI sounds are satisfying and rewarding: soft clicks for selections, pleasant chimes for correct moves, gentle buzzes for errors, celebratory arpeggios for puzzle completion. Sound design emphasizes clarity - each puzzle element has a distinct sound signature. Optional: generative music system that creates unique soundscapes based on puzzle configuration. Extremely low memory footprint. Adaptive volume that ducks during player thinking. Include "focus mode" with minimal audio. Colorblind-friendly audio cues for visual elements.',
    tags: ['minimal', 'puzzle', 'ambient', 'subtle', 'calming'],
    metadata: {
      musicStyle: ['minimal', 'ambient', 'generative'],
      soundEffects: ['UI sounds', 'Puzzle feedback', 'Satisfying clicks'],
      moodProgression: 'Calm and non-distracting',
      integration: ['Generative music', 'Adaptive volume', 'Contextual SFX variations'],
      technicalNeeds: ['Low memory footprint', 'Generative synthesis'],
      accessibility: ['Focus mode', 'Colorblind audio cues', 'Volume controls', 'Audio-only mode'],
      volumeBalance: 40,
      tempoAdjustment: 30,
      audioLength: 'Very long or generative (continuous)',
      licensing: 'Royalty-free',
      voiceActing: false
    }
  }
];

export function getAudioTemplateById(id: string): AudioTemplate | undefined {
  return audioTemplates.find(template => template.id === id);
}

export function getAudioTemplatesByCategory(category: string): AudioTemplate[] {
  if (category === 'all') return audioTemplates;
  return audioTemplates.filter(template => template.category.toLowerCase() === category.toLowerCase());
}

export const audioCategories = [
  'all',
  'Electronic',
  'Ambient',
  'Orchestral',
  'Chiptune',
  'Horror',
  'Jazz',
  'Minimal'
];
