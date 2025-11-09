# AI Game Wizard - Complete Feature Guide

## Overview

The AI Game Wizard is a comprehensive, browser-based tool for creating BBS door games using AI. It features multi-AI provider support, streaming generation, templates, and an amazing user experience.

## ✨ Key Features

### 1. **Multi-AI Provider Support**
- **Claude (Anthropic)** - Best quality, balanced speed
- **OpenAI GPT** - Fast, excellent quality
- **Google Gemini** - Fast, low cost
- **Ollama (Local)** - Free, runs locally

### 2. **API Key Management**
- **Global Settings**: Configure API keys once in Settings (Ctrl+,)
- **Per-generation Override**: Use different keys for specific generations
- **Server Fallback**: Use server-configured keys
- **Secure Storage**: Keys stored locally in browser (localStorage)
- **Show/Hide Toggle**: Password-style inputs with visibility toggle

### 3. **Game Templates**
Pre-built templates for quick starts:
- **Space Shooter** - Arcade action (Beginner, 2-3 min)
- **Text Adventure RPG** - Dungeon crawler (Intermediate, 3-4 min)
- **Logic Puzzle** - Brain teasers (Beginner, 2 min)
- **Trivia Quiz** - Q&A game (Beginner, 1-2 min)
- **Turn-Based Strategy** - Resource management (Advanced, 4-5 min)
- **Custom Game** - Start from scratch (Intermediate, 3-5 min)

### 4. **Enhanced User Experience**
- **5-Step Wizard**: Template → Details → AI Setup → Generate → Preview
- **Real-time Feedback**: Progress bars, phase indicators
- **Cost Estimation**: See estimated API costs before generating
- **Token Counting**: Real-time token usage prediction
- **Sound Effects**: Success notification on completion
- **Celebrations**: Visual feedback when game is created
- **Code Preview**: Review generated code before saving
- **Regeneration**: Don't like the result? Regenerate with one click
- **Quality Modes**: Fast / Balanced / Best

### 5. **Streaming Generation**
- **Live Updates**: Watch code being generated in real-time
- **Progress Tracking**: See exactly what phase the AI is in
- **Cancellation Support**: (Coming soon) Stop generation mid-stream
- **Multiple Attempts**: Generate multiple versions and pick the best

## 🚀 How to Use

### Step 1: Access the Wizard
1. Start preview server: `cd sdk/tools/preview && node server.js`
2. Open browser: `http://localhost:8080`
3. Click **"Create with AI"** button in left sidebar

### Step 2: Configure API Keys (One-Time Setup)
#### Option A: Global Settings
1. Press `Ctrl+,` to open Settings
2. Scroll to "AI API Keys" section
3. Enter your API keys for desired providers:
   - Claude: Get from https://console.anthropic.com/settings/keys
   - OpenAI: Get from https://platform.openai.com/api-keys
   - Gemini: Get from https://makersuite.google.com/app/apikey
   - Ollama: Install locally and use http://localhost:11434
4. Click "Save API Keys"

#### Option B: Server Configuration (For Teams)
Set environment variables:
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export GEMINI_API_KEY="..."
```

### Step 3: Create a Game

#### 📋 Step 1: Choose Template
- Browse available templates
- Each shows:
  - Preview art (ASCII)
  - Difficulty level
  - Estimated generation time
  - Pre-configured features
- Select one or choose "Custom Game"

#### ✏️ Step 2: Customize Details
- **Game Name**: What players will see
- **Description**: Detailed explanation of game mechanics, story, objectives
  - Be specific! More detail = better results
  - Mention target audience, difficulty, style
- **Token Counter**: Shows estimated API usage
- Preview your selections

#### 🤖 Step 3: AI Configuration
- **Select Provider**: Claude / OpenAI / Gemini / Ollama
- **Choose Model**: Pick from available models
  - Each shows speed, quality, cost indicators
- **API Key**: Use global key or override
- **Quality Mode**:
  - **Fast**: Quick iterations, good quality
  - **Balanced**: Best mix of speed/quality (recommended)
  - **Best**: Highest quality, slower
- **Cost Estimate**: See projected cost before generating

#### ⚡ Step 4: Generate
- Real-time progress bar
- Phase indicators:
  - "Preparing request..."
  - "Calling AI..."
  - "Generating code..."
  - "Creating project files..."
  - "Installing dependencies..."
- **Streaming Code View**: Watch code appear live
- Sound notification on completion

#### 👁️ Step 5: Preview & Save
- **Code Preview**: Full syntax-highlighted code
- **Review Options**:
  - **Regenerate**: Try again with same settings
  - **Save Game**: Accept and create the door
- Once saved:
  - Project created in `sdk/examples/[game-name]/`
  - Dependencies auto-installed
  - Game auto-selected in preview
  - Ready to run!

## 🎮 Using Your Generated Game

### Immediate Testing
1. Game automatically selected after creation
2. Click **"Run"** button to test
3. Play in the terminal window
4. Use **"Build"** to compile
5. Check **"Code"** tab to view/edit source

### File Structure
```
sdk/examples/your-game/
├── index.ts          # Main game code (AI-generated)
├── package.json      # Dependencies and scripts
├── tsconfig.json     # TypeScript configuration
├── README.md         # Game documentation
└── node_modules/     # Installed dependencies
```

### Available Commands
```bash
cd sdk/examples/your-game

# Run the game
npm start

# Build TypeScript
npm run build

# Type check
npx tsc --noEmit
```

## 🔧 Advanced Features

### Multiple Providers
Switch providers based on needs:
- **Quick prototypes**: Gemini (fast, cheap)
- **Production quality**: Claude (best results)
- **Experimentation**: Ollama (free, local)
- **General use**: OpenAI (reliable)

### Iteration Workflow
1. Generate initial version
2. Test and identify improvements
3. Refine description in wizard
4. Regenerate with updated requirements
5. Compare versions
6. Save preferred version

### Cost Optimization
- Start with cheaper providers (Gemini/Ollama)
- Use Claude/OpenAI for final polish
- Optimize descriptions to reduce token usage
- Use "Fast" mode for iterations

### Template Customization
Templates provide starting points but are fully customizable:
- Add/remove features in Step 1
- Modify description in Step 2
- AI generates from YOUR specifications

## 🎨 UI/UX Features

### Visual Design
- **Gradient backgrounds**: Purple/blue theme
- **Animated elements**: Pulsing icons, smooth transitions
- **Progress indicators**: Real-time feedback
- **Dark theme**: Easy on the eyes
- **Responsive layout**: Works on different screen sizes

### User Feedback
- **Error handling**: Clear, actionable error messages
- **Success celebrations**: Visual and audio feedback
- **Loading states**: Never wonder what's happening
- **Tooltips**: (Coming soon) Contextual help
- **Keyboard shortcuts**: Fast power-user workflows

### Accessibility
- **Keyboard navigation**: Full keyboard support
- **Screen reader friendly**: Semantic HTML
- **High contrast**: Readable colors
- **Clear typography**: Easy-to-read fonts

## 🐛 Troubleshooting

### "No API key provided"
- Check Settings (Ctrl+,) → AI API Keys
- Verify key is saved (click "Save API Keys")
- Or provide key in wizard Step 3

### "Generation failed"
- **Check API key validity**: Test on provider's website
- **Quota exceeded**: Check your API usage limits
- **Description too long**: Reduce token count
- **Server error**: Check console logs

### "Code has errors"
- Click "Regenerate" for another attempt
- Try different quality mode
- Refine description to be more specific
- Switch to different AI provider

### "Slow generation"
- Normal for "Best" quality mode
- Try "Fast" or "Balanced" mode
- Claude/OpenAI faster than local Ollama
- Check internet connection

## 📊 Comparison: Basic vs Enhanced Wizard

| Feature | Basic Wizard | Enhanced Wizard |
|---------|--------------|-----------------|
| AI Providers | Claude only | 4 providers |
| Templates | None | 6 templates |
| Progress Feedback | Basic spinner | Real-time streaming |
| Cost Preview | No | Yes |
| Code Preview | No | Yes |
| Regeneration | No | Yes |
| API Key Management | Per-use only | Global settings |
| Quality Options | No | 3 modes |
| Sound/Visual Feedback | No | Yes |
| Token Estimation | No | Yes |
| Success Animation | Basic | Celebration |

## 🚀 Future Enhancements

### Planned Features
- **Multi-attempt comparison**: Generate 3 versions, pick best
- **Iteration mode**: Refine existing games with AI
- **Chat interface**: Conversational game design
- **Voice input**: Speak your game idea
- **Asset generation**: AI-generated ASCII art
- **Multiplayer templates**: Network-enabled games
- **Export/Share**: Share game concepts
- **Community templates**: User-contributed templates
- **Analytics**: Track generation success rates
- **A/B testing**: Compare different prompts

### Performance Improvements
- **Caching**: Cache common patterns
- **Parallel generation**: Generate code in chunks
- **Optimistic UI**: Show preview before full generation
- **Background processing**: Generate while you browse

## 💡 Tips for Best Results

### Writing Effective Descriptions
```
❌ Bad: "Make a space game"

✅ Good: "Create an arcade-style space shooter where the player
controls a ship at the bottom of the screen, shooting at waves of
descending alien enemies. Include power-ups that drop from destroyed
enemies, a score system, and increasing difficulty. Use retro ASCII
graphics with * for stars, <=> for the player ship, and various
symbols for enemies."
```

### Feature Selection
- **Start minimal**: Add core features first
- **Test iteratively**: Generate, test, refine
- **Be specific**: "Turn-based combat with rock-paper-scissors mechanics"
- **Consider scope**: More features = more complexity

### Provider Selection
- **Prototyping**: Gemini (fast iterations)
- **Final version**: Claude (best quality)
- **Learning/Testing**: Ollama (unlimited generations)
- **Production**: OpenAI (reliable, fast)

## 📝 Example Workflow

### Creating a Card Game
1. **Template**: Custom Game
2. **Name**: "Cosmic Poker"
3. **Description**:
   ```
   A 5-card draw poker game set in space. Player starts with 1000
   credits. Each round, player is dealt 5 cards and can choose which
   to keep/discard. After draw, hand is evaluated (pair, two pair,
   straight, flush, full house, etc.). Betting system with ante and
   raises. ASCII card graphics using suit symbols: ♠ ♥ ♦ ♣. Track
   high score across sessions.
   ```
4. **Features**: Save/Load game, High scores, Sound effects
5. **Provider**: Claude (best for complex logic)
6. **Model**: claude-sonnet-4 (balanced)
7. **Generate** → Review → Save
8. **Test** → Iterate if needed

## 🎯 Success Metrics

Generated games should:
- ✅ Compile without TypeScript errors
- ✅ Run without runtime errors
- ✅ Implement requested features
- ✅ Follow BBS aesthetic (80x24, ANSI)
- ✅ Handle user input correctly
- ✅ Be playable and fun
- ✅ Include proper documentation

## 🤝 Contributing

Want to improve the wizard?
- Add more templates
- Support additional AI providers
- Enhance UI/UX
- Improve prompts for better generation
- Add example games
- Write better documentation

## 📞 Support

- **Issues**: Check preview server logs
- **Questions**: Ask in wizard (help button)
- **Bugs**: Report to development team
- **Ideas**: Suggest new features

---

**Enjoy creating amazing BBS games with AI! 🎮✨**
