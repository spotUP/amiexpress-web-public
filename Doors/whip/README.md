# WHIP - Demo Scene Project Management Door

**Version:** 1.0.0
**Author:** AmiExpress Team
**Command:** `WHIP`

## Overview

WHIP (Workflow Hub for Intro Productions) is a gamified BBS door for managing demo scene projects. It provides Kanban-style task management, party deadline tracking, achievements, and leaderboards - all with a retro demo scene aesthetic using text-based UI.

## Features

### Core Features (v1.0)
- Kanban board (TODO / IN PROGRESS / TESTING / DONE)
- Project management (create, edit, delete)
- Task management (create, assign, complete, move)
- Task priorities using scene terms (Lamer/Scener/Elite/Legend)
- Party timeline with countdowns
- Auto-scrape upcoming parties from demoparty.net (24h cache)
- Points & level system (Lamer → Scener → Elite → Legend)
- All 30 achievements (fully implemented)
- Leaderboard (top sceners ranked by points)
- Retro text-based UI (ANSI colors, box-drawing, no emojis)
- Mouse & keyboard navigation
- Data persistence (JSON files)

### Achievement Categories
- **Tasks** (8 achievements): First Release, Getting Started, Productive, Unstoppable, Code Wizard, Pixel Perfectionist, Beat Master, Swiss Army Knife
- **Projects** (5 achievements): Project Starter, Organizer, Production House, 64k Hero, 4k Legend
- **Parties** (6 achievements): Party Animal, The Real Thing, Competition Winner, Revision Regular, Assembly Attendee, Evoke Enthusiast
- **Speed & Crunch** (5 achievements): Speed Demon, Crunch Master, All-Nighter, Weekend Warrior, Deadline Dodger
- **Social** (3 achievements): Team Player, Helpful, Crew Leader
- **Special** (3 achievements): Scene Veteran, Completionist, Legend Status

## Installation

1. Build the door:
   ```bash
   cd Doors/whip
   npm install
   npm run build
   ```

2. The door is automatically registered via `Commands/BBSCmd/WHIP.info`

3. Access from BBS: Type `WHIP` at the main menu

## Usage

### Main Menu
- **[N]** New Project - Create a new demo scene project
- **[V]** View All Projects - Browse all projects
- **[K]** Kanban Board - View/manage tasks in Kanban columns
- **[T]** My Tasks - View tasks assigned to you
- **[P]** Party Timeline - See upcoming demoparties with countdowns
- **[L]** Leaderboard - View top sceners ranked by points
- **[A]** Achievements - View unlocked/locked achievements
- **[Q]** Quit - Exit door

### Kanban Board
- **[←→]** Switch between columns
- **[↑↓]** Select task
- **[Enter]** Edit task
- **[N]** Create new task
- **[M]** Move task to next column (earns points when moved to DONE)
- **[D]** Delete task
- **[Q]** Back to main menu

### Creating Projects
1. Select "New Project" from main menu
2. Enter project name
3. Select type (demo, intro, musicdisk, graphics, music, code, tools)
4. Set status (planning, active, released)
5. Optionally add description
6. Save

### Creating Tasks
1. From Kanban board, press **[N]**
2. Enter task title
3. Select category (code, music, gfx, design, effects, engine, 3d)
4. Set priority (lamer, scener, elite, legend)
5. Assign points (5-100 in 5pt increments)
6. Optionally add description
7. Save

### Earning Points
- Complete tasks by moving them to DONE column
- Earn points based on task value
- Unlock achievements for milestones
- Climb the leaderboard
- Reach higher levels (Lamer → Scener → Elite → Legend)

## Data Storage

All data is stored in `Doors/whip/data/`:
- `projects.json` - All projects (global)
- `tasks.json` - All tasks (global)
- `users.json` - User stats/points (global)
- `achievements.json` - Achievement definitions (global)
- `parties.json` - Party calendar (global)

## Party Data

WHIP automatically fetches upcoming demoparty data from demoparty.net every 24 hours. Manual parties can also be added through the UI.

## Multinode Support

WHIP is fully multinode-capable. Multiple users can access the door simultaneously without conflicts.

## Technical Details

- **Runtime:** Server-side TypeScript
- **UI:** Neo-blessed (terminal UI library)
- **Input Management:** DoorInputManager for proper cleanup
- **Data Persistence:** JSON files via SDK Storage API
- **External APIs:** demoparty.net XML feed for party data

## Keyboard Shortcuts

Global:
- **[Q]** or **[ESC]** - Back/Quit
- **[↑↓]** - Navigate lists
- **[Enter]** - Select/Edit
- **[Tab]** - Next field (in forms)

Context-specific shortcuts are shown at the bottom of each screen.

## Future Enhancements (v2.0+)

- Advanced size budget tracker (visual progress bars per category)
- Effect library & reusability
- NFO/credits generator
- Live collaboration (real-time updates)
- Pouet.net integration
- MOD player integration
- Built-in ASCII editor
- Demo template generator

## Support

For issues or feature requests, contact the AmiExpress Team or file an issue in the main repository.

## License

Part of the AmiExpress BBS project.
