# 🎨 Whip - Demo Scene Project Management Door

**Whip** is a gamified BBS door for managing demo scene projects. Track demos, intros, music, graphics, and code with full ANSI/ASCII interface!

## 🌟 Features

### Core Functionality
- **Kanban Board:** Text-based task board (Todo → In Progress → Testing → Done)
- **Task Management:** Create, assign, and track tasks with demo-specific categories
- **Project Tracking:** Demos, Intros, Musicdisks, Graphics, Code, Tools
- **Asset Lists:** Track MOD/XM music, pixel art, effects, and code repos

### Demo Scene Specific
- **Project Types:** Demos, Intros, Musicdisks, Graphics, Code, Tools
- **Asset Categories:** MOD/XM music, pixel art, effects, engines, cracktros
- **Party Timeline:** Track upcoming demoparties and competition deadlines
- **Release Management:** Prepare for Revision, Evoke, Assembly, and more!

### Gamification 🏆
- **Points System:** Earn points for completing tasks
- **Levels:** Progress from Lamer → Scener → Elite → Legend
- **Achievements:** Unlock 30+ achievements (First Release, Party Winner, Crunch Master, etc.)
- **Leaderboards:** Compete with your crew members
- **Animations:** Confetti, scanlines, and retro effects on completions

### ANSI/ASCII Interface
- **Retro Colors:** Cyan/Magenta/Yellow demo scene palette
- **Box Drawing:** Classic ASCII art borders
- **Menu Navigation:** Arrow keys + hotkeys
- **Status Indicators:** Visual task progress bars
- **Party Timeline:** Countdown to demoparties

## 📦 Installation

```bash
# From the whip directory
npm install
npm run build
```

## 🚀 Usage

### As BBS Door
Add to your BBS menu configuration pointing to the compiled door.

### Standalone Testing
```bash
npm run dev
```

## 🎮 Interface

### Main Menu
```
╔═══════════════════════════════════════════════════════════════════════════╗
║                         W H I P   v 1 . 0                                ║
║                    Demo Scene Project Management                         ║
╚═══════════════════════════════════════════════════════════════════════════╝

[Handle: YourHandle]  Level: Scener  Points: 250  Rank: #3

┌─────────────── PROJECTS ────────────────┐
│ [N] New Project                         │
│ [V] View All Projects                   │
│ [K] Kanban Board                        │
│ [T] My Tasks                            │
│ [P] Party Timeline                      │
│ [L] Leaderboard                         │
│ [A] My Achievements                     │
│ [Q] Quit                                │
└─────────────────────────────────────────┘
```

### Kanban Board View
```
╔════════════════════════════════════════════════════════════════════════════╗
║  PROJECT: Revision 2025 Demo                          Party: 18 days left  ║
╠═══════════╦═══════════╦═══════════╦═══════════╗
║   TODO    ║ IN PROGRESS ║  TESTING  ║   DONE    ║
╠═══════════╬═══════════╬═══════════╬═══════════╣
║ #12 Code  ║ #08 Music ║ #03 FX    ║ #01 Logo  ║
║  Raymarsh ║  Chipmusic║  Shader   ║  Pixel    ║
║  [High]   ║  [Medium] ║  [High]   ║  [Done]   ║
║  15pts    ║  10pts    ║  20pts    ║  ✓ 10pts  ║
╚═══════════╩═══════════╩═══════════╩═══════════╝
```

## 🏅 Achievement System

Unlock achievements by completing milestones:

- **First Blood:** Complete first task (10pts)
- **Code Wizard:** Complete 10 coding tasks (50pts)
- **Pixel Perfectionist:** Complete 10 graphics tasks (50pts)
- **Beat Master:** Complete 10 music tasks (50pts)
- **Speed Demon:** Complete 5 tasks in one day (100pts)
- **Party Animal:** Submit release to demoparty (200pts)
- **Crunch Master:** Complete 10 tasks 48h before party (200pts)
- **Scene Veteran:** Active for 365 days (500pts)
- **And 22 more!**

## 🎨 Technical Details

- **Language:** TypeScript
- **SDK:** @amiexpress/bbs-door-sdk
- **Storage:** JSON files (lightweight)
- **Display:** 80x24 ANSI/ASCII
- **Input:** Arrow keys, hotkeys

## 📁 Data Files

- `data/projects.json` - All projects
- `data/tasks.json` - All tasks
- `data/users.json` - User stats and points
- `data/achievements.json` - Achievement progress
- `data/parties.json` - Upcoming demoparties


## 🤝 Contributing

Whip is built for the demo scene, by the demo scene. Contributions welcome!

## 📜 License

MIT License - See LICENSE file

## 🤝 Demo Scene Credits

Inspired by the amazing demo scene community and tools like:
- FastTracker 2
- Protracker
- Pouet.net
- Demozoo
- Scene.org

**Greetings to:** All demo sceners keeping the scene alive! 🎉

---

Made with ❤️ for the demo scene
