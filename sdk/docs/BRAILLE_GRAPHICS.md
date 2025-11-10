# Braille Graphics with node-drawille

The AmiExpress SDK provides high-resolution terminal graphics using Unicode braille characters through the **drawille** (node-drawille) library. This allows you to create smooth visualizations, waveforms, VU meters, and other graphics at 2x4 pixel resolution per character cell.

## Overview

Braille graphics use Unicode braille characters (U+2800 to U+28FF) where each character represents a 2x4 pixel grid. This gives you **double the horizontal resolution** and **quadruple the vertical resolution** compared to standard ASCII art.

**Example:**
- Standard terminal: 80 columns × 24 rows = 1,920 "pixels"
- Braille graphics: 160 pixels × 96 pixels = 15,360 pixels!

## Integration

The SDK wraps the [node-drawille](https://github.com/madbence/node-drawille) library (published as `drawille` on npm) to provide a consistent API that works seamlessly with BBS doors.

## Quick Start

```typescript
import { BrailleCanvas } from '@amiexpress/bbs-door-sdk';

// Create a canvas (dimensions in pixels, not characters)
const canvas = new BrailleCanvas(160, 96);

// Draw a sine wave
for (let x = 0; x < 160; x++) {
  const y = Math.sin(x / 10) * 20 + 48;
  canvas.set(x, Math.floor(y));
}

// Render to terminal
const frame = canvas.frame();
door.sendAnsi(frame);
```

## BrailleCanvas API

### Constructor

```typescript
const canvas = new BrailleCanvas(width, height, config?);
```

- `width` - Canvas width in **pixels** (will be rounded to multiple of 2)
- `height` - Canvas height in **pixels** (will be rounded to multiple of 4)
- `config` - Optional configuration object:
  - `background` - Background character (default: `' '`)

### Drawing Methods

#### Basic Pixel Operations

```typescript
// Set a pixel
canvas.set(x, y);

// Unset a pixel
canvas.unset(x, y);

// Toggle a pixel
canvas.toggle(x, y);

// Check if pixel is set (limited support)
const isSet = canvas.get(x, y);
```

#### Lines

```typescript
// Draw a line using Bresenham's algorithm
canvas.drawLine(x0, y0, x1, y1);

// Example: Diagonal line
canvas.drawLine(0, 0, 160, 96);
```

#### Rectangles

```typescript
// Draw rectangle outline
canvas.drawRect(x, y, width, height, false);

// Draw filled rectangle
canvas.drawRect(x, y, width, height, true);

// Example: Border
canvas.drawRect(0, 0, 160, 96, false);
```

#### Circles

```typescript
// Draw circle outline
canvas.drawCircle(centerX, centerY, radius, false);

// Draw filled circle
canvas.drawCircle(centerX, centerY, radius, true);

// Example: Target
canvas.drawCircle(80, 48, 30, false);
canvas.drawCircle(80, 48, 20, false);
canvas.drawCircle(80, 48, 10, true);
```

#### Clear Canvas

```typescript
canvas.clear();
```

### Rendering

```typescript
// Get frame as string
const output = canvas.frame();

// Send to BBS user
door.sendAnsi(output);
```

### Dimensions

```typescript
// Get canvas size in pixels
const { width, height } = canvas.getPixelDimensions();

// Get canvas size in characters
const { width, height } = canvas.getCharDimensions();
```

## Pre-Built Visualizations

The SDK includes ready-to-use visualization classes:

### VU Meter

```typescript
import { BrailleVUMeter } from '@amiexpress/bbs-door-sdk';

const meter = new BrailleVUMeter(40, 96); // width, height in pixels

// Update with audio level (0.0 to 1.0)
const frame = meter.update(0.75);
door.sendAnsi(frame);

// Reset peak hold
meter.resetPeak();
```

### Waveform Display

```typescript
import { BrailleWaveform } from '@amiexpress/bbs-door-sdk';

const waveform = new BrailleWaveform(160, 32);

// Update with audio samples (-1.0 to 1.0)
const samples = new Float32Array(1024);
// ... fill samples with audio data ...
const frame = waveform.update(Array.from(samples));
door.sendAnsi(frame);
```

### Spectrum Analyzer

```typescript
import { BrailleSpectrum } from '@amiexpress/bbs-door-sdk';

const spectrum = new BrailleSpectrum(160, 32);

// Update with frequency magnitudes (0.0 to 1.0)
const frequencies = [0.5, 0.7, 0.9, 0.8, 0.6, 0.4, 0.3, 0.2];
const frame = spectrum.update(frequencies);
door.sendAnsi(frame);
```

## Complete Example: Audio Visualizer

```typescript
import {
  Door,
  BrailleCanvas,
  BrailleVUMeter,
  BrailleWaveform,
  BrailleSpectrum
} from '@amiexpress/bbs-door-sdk';

class AudioVisualizer {
  private door: Door;
  private vuMeter: BrailleVUMeter;
  private waveform: BrailleWaveform;
  private spectrum: BrailleSpectrum;

  constructor() {
    this.door = new Door({ name: 'Audio Visualizer', version: '1.0.0' });
    this.vuMeter = new BrailleVUMeter(20, 80);
    this.waveform = new BrailleWaveform(120, 32);
    this.spectrum = new BrailleSpectrum(120, 32);

    this.door.onConnect(() => this.start());
  }

  private start(): void {
    // Simulate audio data
    setInterval(() => {
      const level = Math.random();
      const samples = Array.from({ length: 512 }, () => Math.random() * 2 - 1);
      const frequencies = Array.from({ length: 32 }, () => Math.random());

      this.render(level, samples, frequencies);
    }, 100);
  }

  private render(level: number, samples: number[], frequencies: number[]): void {
    // Clear screen
    this.door.sendAnsi('\x1b[2J\x1b[H');

    // Title
    this.door.send('=== Audio Visualizer ===\n\n');

    // VU Meter
    this.door.send('VU Meter:\n');
    this.door.sendAnsi(this.vuMeter.update(level));
    this.door.send('\n\n');

    // Waveform
    this.door.send('Waveform:\n');
    this.door.sendAnsi(this.waveform.update(samples));
    this.door.send('\n\n');

    // Spectrum
    this.door.send('Spectrum:\n');
    this.door.sendAnsi(this.spectrum.update(frequencies));
  }

  start(): void {
    this.door.start();
  }
}

new AudioVisualizer().start();
```

## Advanced: Custom Animations

```typescript
import { BrailleCanvas } from '@amiexpress/bbs-door-sdk';

class BouncingBall {
  private canvas: BrailleCanvas;
  private x: number = 80;
  private y: number = 48;
  private vx: number = 2;
  private vy: number = 2;

  constructor() {
    this.canvas = new BrailleCanvas(160, 96);
    this.animate();
  }

  private animate(): void {
    setInterval(() => {
      // Update position
      this.x += this.vx;
      this.y += this.vy;

      // Bounce off walls
      if (this.x <= 0 || this.x >= 160) this.vx *= -1;
      if (this.y <= 0 || this.y >= 96) this.vy *= -1;

      // Render
      this.canvas.clear();
      this.canvas.drawCircle(this.x, this.y, 5, true);

      // Draw border
      this.canvas.drawRect(0, 0, 160, 96, false);

      console.log('\x1b[2J\x1b[H' + this.canvas.frame());
    }, 50);
  }
}

new BouncingBall();
```

## Drawing Complex Shapes

```typescript
import { BrailleCanvas } from '@amiexpress/bbs-door-sdk';

const canvas = new BrailleCanvas(160, 96);

// Star pattern
const centerX = 80;
const centerY = 48;
const points = 5;
const outerRadius = 40;
const innerRadius = 20;

for (let i = 0; i < points * 2; i++) {
  const angle = (i * Math.PI) / points;
  const radius = i % 2 === 0 ? outerRadius : innerRadius;
  const x = centerX + Math.cos(angle) * radius;
  const y = centerY + Math.sin(angle) * radius;

  const nextAngle = ((i + 1) * Math.PI) / points;
  const nextRadius = (i + 1) % 2 === 0 ? outerRadius : innerRadius;
  const nextX = centerX + Math.cos(nextAngle) * nextRadius;
  const nextY = centerY + Math.sin(nextAngle) * nextRadius;

  canvas.drawLine(x, y, nextX, nextY);
}

console.log(canvas.frame());
```

## Performance Tips

1. **Batch Updates**: Update multiple pixels before calling `frame()`
2. **Clear Strategically**: Only clear when necessary, or clear specific regions
3. **Optimize Loops**: Draw from data structures efficiently
4. **Frame Rate**: Aim for 10-30 FPS for smooth animations in terminals
5. **Size Matters**: Larger canvases = more computation. Use appropriate sizes.

## Limitations

1. **No Color Support**: Braille graphics are monochrome
2. **No Pixel Query**: The `get()` method has limited support (drawille limitation)
3. **Terminal Support**: Requires terminal with Unicode braille support
4. **Font Rendering**: Appearance depends on terminal font

## Use Cases

- 📊 VU meters and audio visualizations
- 📈 Real-time data graphs
- 🎮 Simple pixel-based games
- 📉 Stock charts and analytics
- 🎵 Music trackers and sequencers
- 🎨 ASCII art creation tools

## References

- [node-drawille GitHub](https://github.com/madbence/node-drawille)
- [drawille npm package](https://www.npmjs.com/package/drawille)
- [Unicode Braille Patterns](https://en.wikipedia.org/wiki/Braille_Patterns)
- [Bresenham's Line Algorithm](https://en.wikipedia.org/wiki/Bresenham%27s_line_algorithm)

## See Also

- [Graphics Engine](./GRAPHICS_ENGINE.md) - Full-featured graphics engine with sprites, particles, etc.
- [Audio Engine](./AUDIO_ENGINE.md) - Working with audio in BBS doors
- [Tracker Door Example](../examples/tracker-door/) - Complete music tracker using braille graphics
