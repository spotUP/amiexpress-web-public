/**
 * PhreakWars UI Module
 *
 * All display functions and UI rendering for the game.
 */
import { calculateGameProgress, updateAchievements, getNextMilestone } from './player';
/**
 * Display progress bar
 */
export function displayProgressBar(socket, progress) {
    const barWidth = 20;
    const filledBars = Math.floor((progress / 100) * barWidth);
    const emptyBars = barWidth - filledBars;
    const filled = '='.repeat(filledBars);
    const empty = '-'.repeat(emptyBars);
    socket.emit('ansi-output', '\x1b[36mProgress:\x1b[0m ');
    socket.emit('ansi-output', `\x1b[32m${filled}\x1b[0m`);
    socket.emit('ansi-output', `\x1b[37m${empty}\x1b[0m`);
    socket.emit('ansi-output', ` \x1b[33m${progress.toFixed(1)}%\x1b[0m\r\n`);
}
/**
 * Display main menu
 */
export function displayMainMenu(socket, gameState) {
    socket.emit('ansi-output', '\x1b[2J\x1b[H');
    socket.emit('ansi-output', '\x1b[36m+==============================================================+\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[36m|\x1b[0m                    \x1b[32mPHREAK WARS\x1b[0m                              \x1b[36m|\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[36m|\x1b[0m              \x1b[33mTHE UNDERGROUND BBS EMPIRE\x1b[0m                   \x1b[36m|\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[36m+==============================================================+\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', `\x1b[32mHandle:\x1b[0m ${gameState.player.handle}\r\n`);
    socket.emit('ansi-output', `\x1b[32mSkill Level:\x1b[0m ${gameState.player.skillLevel.toFixed(1)}\r\n`);
    socket.emit('ansi-output', `\x1b[32mMoney:\x1b[0m $${gameState.player.money}\r\n`);
    socket.emit('ansi-output', `\x1b[32mPhone Bills:\x1b[0m $${gameState.player.phoneBills}\r\n`);
    const progress = calculateGameProgress(gameState);
    displayProgressBar(socket, progress);
    updateAchievements(gameState);
    const nextMilestone = getNextMilestone(gameState);
    if (nextMilestone) {
        socket.emit('ansi-output', `\x1b[33mNext Milestone:\x1b[0m ${nextMilestone}\r\n`);
    }
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', '\x1b[36m[P]\x1b[0m Phreaking & Hacking\r\n');
    socket.emit('ansi-output', '\x1b[36m[B]\x1b[0m BBS Exploration\r\n');
    socket.emit('ansi-output', '\x1b[36m[C]\x1b[0m Programming & Coding\r\n');
    socket.emit('ansi-output', '\x1b[36m[T]\x1b[0m Black Market Trading\r\n');
    socket.emit('ansi-output', '\x1b[36m[U]\x1b[0m Computer Upgrades\r\n');
    socket.emit('ansi-output', '\x1b[36m[S]\x1b[0m Shadow (Romance)\r\n');
    socket.emit('ansi-output', '\x1b[36m[M]\x1b[0m Multiplayer BBS\r\n');
    socket.emit('ansi-output', '\x1b[36m[I]\x1b[0m Inventory & Stats\r\n');
    socket.emit('ansi-output', '\x1b[36m[L]\x1b[0m Daily Limits\r\n');
    socket.emit('ansi-output', '\x1b[36m[H]\x1b[0m Help\r\n');
    socket.emit('ansi-output', '\x1b[36m[Q]\x1b[0m Quit Game\r\n\r\n');
    socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
    gameState.currentMode = 'main_menu';
}
/**
 * Display upgrades menu
 */
export function displayUpgradesMenu(socket, gameState) {
    socket.emit('ansi-output', '\x1b[2J\x1b[H');
    socket.emit('ansi-output', '\x1b[36m-= COMPUTER UPGRADES =-\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', `\x1b[32mMoney:\x1b[0m $${gameState.player.money}\r\n\r\n`);
    socket.emit('ansi-output', '\x1b[36mCurrent System:\x1b[0m\r\n');
    socket.emit('ansi-output', `  RAM: ${gameState.player.computer.ram}KB\r\n`);
    socket.emit('ansi-output', `  Storage: ${gameState.player.computer.storage}KB\r\n`);
    socket.emit('ansi-output', `  Modem: ${gameState.player.computer.modemSpeed} baud\r\n\r\n`);
    socket.emit('ansi-output', '\x1b[36mAvailable Upgrades:\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[33m[1]\x1b[0m Extra RAM (64KB) - $50\r\n');
    socket.emit('ansi-output', '\x1b[33m[2]\x1b[0m Larger Storage (170KB) - $30\r\n');
    socket.emit('ansi-output', '\x1b[33m[3]\x1b[0m Faster Modem (300 baud upgrade) - $100\r\n');
    socket.emit('ansi-output', '\x1b[33m[M]\x1b[0m Back to Main Menu\r\n\r\n');
    socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
    gameState.currentMode = 'upgrades';
}
/**
 * Display help
 */
export function displayHelp(socket, gameState) {
    socket.emit('ansi-output', '\x1b[2J\x1b[H');
    socket.emit('ansi-output', '\x1b[36m-= PHREAK WARS HELP =-\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', '\x1b[32mGAME OBJECTIVE:\x1b[0m\r\n');
    socket.emit('ansi-output', 'Become a master hacker by progressing from novice to legendary status.\r\n\r\n');
    socket.emit('ansi-output', '\x1b[32mMAIN MENU OPTIONS:\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[36m[P]\x1b[0m Phreaking - Learn phone manipulation techniques\r\n');
    socket.emit('ansi-output', '\x1b[36m[B]\x1b[0m BBS Exploration - Connect to underground systems\r\n');
    socket.emit('ansi-output', '\x1b[36m[C]\x1b[0m Programming - Learn coding and create tools\r\n');
    socket.emit('ansi-output', '\x1b[36m[T]\x1b[0m Trading - Buy/sell on the black market\r\n');
    socket.emit('ansi-output', '\x1b[36m[U]\x1b[0m Upgrades - Improve your computer\r\n');
    socket.emit('ansi-output', '\x1b[36m[S]\x1b[0m Shadow - Romance storyline\r\n');
    socket.emit('ansi-output', '\x1b[36m[M]\x1b[0m Multiplayer - BBS competition\r\n');
    socket.emit('ansi-output', '\x1b[36m[I]\x1b[0m Stats - View your progress\r\n\r\n');
    socket.emit('ansi-output', '\x1b[32mTIPS:\x1b[0m\r\n');
    socket.emit('ansi-output', '* Start with phreaking to earn money\r\n');
    socket.emit('ansi-output', '* Upgrade your computer for better performance\r\n');
    socket.emit('ansi-output', '* Visit BBS chat rooms to meet Shadow\r\n');
    socket.emit('ansi-output', '* Watch your phone bills!\r\n\r\n');
    socket.emit('ansi-output', '\x1b[32mPress any key to continue...\x1b[0m');
    gameState.currentMode = 'waiting';
}
/**
 * Display stats
 */
export function displayStats(socket, gameState) {
    socket.emit('ansi-output', '\x1b[2J\x1b[H');
    socket.emit('ansi-output', '\x1b[36m-= PLAYER STATS =-\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', `\x1b[32mHandle:\x1b[0m ${gameState.player.handle}\r\n`);
    socket.emit('ansi-output', `\x1b[32mSkill Level:\x1b[0m ${gameState.player.skillLevel.toFixed(1)}\r\n`);
    socket.emit('ansi-output', `\x1b[32mMoney:\x1b[0m $${gameState.player.money}\r\n`);
    socket.emit('ansi-output', `\x1b[32mPhone Bills:\x1b[0m $${gameState.player.phoneBills}\r\n\r\n`);
    socket.emit('ansi-output', '\x1b[36mSkills:\x1b[0m\r\n');
    socket.emit('ansi-output', `  Phreaking: ${gameState.player.skills.phreaking}/100\r\n`);
    socket.emit('ansi-output', `  Programming: ${gameState.player.skills.programming}/100\r\n`);
    socket.emit('ansi-output', `  Hacking: ${gameState.player.skills.hacking}/100\r\n\r\n`);
    socket.emit('ansi-output', '\x1b[36mAchievements:\x1b[0m\r\n');
    if (gameState.player.achievements.length === 0) {
        socket.emit('ansi-output', '  None yet\r\n');
    }
    else {
        gameState.player.achievements.forEach(achievement => {
            socket.emit('ansi-output', `  * ${achievement}\r\n`);
        });
    }
    socket.emit('ansi-output', '\r\n\x1b[36mInventory:\x1b[0m\r\n');
    if (gameState.player.inventory.length === 0) {
        socket.emit('ansi-output', '  Empty\r\n');
    }
    else {
        gameState.player.inventory.forEach(item => {
            socket.emit('ansi-output', `  * ${item}\r\n`);
        });
    }
    socket.emit('ansi-output', '\r\n\x1b[36mOptions:\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[33m[D]\x1b[0m Delete Player and Create New\r\n');
    socket.emit('ansi-output', '\x1b[33m[M]\x1b[0m Back to Main Menu\r\n\r\n');
    socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
    gameState.currentMode = 'stats_menu';
}
/**
 * Display phreaking menu
 */
export function displayPhreakingMenu(socket, gameState) {
    socket.emit('ansi-output', '\x1b[2J\x1b[H');
    socket.emit('ansi-output', '\x1b[36m-= PHREAKING & HACKING =-\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', `\x1b[32mPhreaking Skill:\x1b[0m ${gameState.player.skills.phreaking}/100\r\n`);
    socket.emit('ansi-output', `\x1b[32mHacking Skill:\x1b[0m ${gameState.player.skills.hacking}/100\r\n\r\n`);
    socket.emit('ansi-output', '\x1b[36m[R]\x1b[0m Red Boxing (Coin phone fraud)\r\n');
    socket.emit('ansi-output', '\x1b[36m[B]\x1b[0m Blue Boxing (Trunk seizing)\r\n');
    socket.emit('ansi-output', '\x1b[36m[T]\x1b[0m Tone Generation Practice\r\n');
    socket.emit('ansi-output', '\x1b[36m[H]\x1b[0m Hacking Challenges\r\n');
    socket.emit('ansi-output', '\x1b[36m[G]\x1b[0m Government Hack (Final Challenge)\r\n');
    socket.emit('ansi-output', '\x1b[36m[M]\x1b[0m Back to Main Menu\r\n\r\n');
    socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
    gameState.currentMode = 'phreaking';
    gameState.previousMode = 'main_menu';
}
/**
 * Display programming menu
 */
export function displayProgrammingMenu(socket, gameState) {
    socket.emit('ansi-output', '\x1b[2J\x1b[H');
    socket.emit('ansi-output', '\x1b[36m-= PROGRAMMING & CODING =-\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', `\x1b[32mProgramming Skill:\x1b[0m ${gameState.player.skills.programming}/100\r\n\r\n`);
    socket.emit('ansi-output', '\x1b[36m[P]\x1b[0m Practice Programming\r\n');
    socket.emit('ansi-output', '\x1b[36m[W]\x1b[0m Write Phreaking Tools\r\n');
    socket.emit('ansi-output', '\x1b[36m[D]\x1b[0m Develop Hacking Scripts\r\n');
    socket.emit('ansi-output', '\x1b[36m[M]\x1b[0m Back to Main Menu\r\n\r\n');
    socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
    gameState.currentMode = 'programming';
    gameState.previousMode = 'main_menu';
}
/**
 * Display trading menu
 */
export function displayTradingMenu(socket, gameState) {
    socket.emit('ansi-output', '\x1b[2J\x1b[H');
    socket.emit('ansi-output', '\x1b[36m-= BLACK MARKET TRADING =-\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', `\x1b[32mMoney:\x1b[0m $${gameState.player.money}\r\n\r\n`);
    socket.emit('ansi-output', '\x1b[36mAvailable Items:\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[33m[1]\x1b[0m Red Box - $75\r\n');
    socket.emit('ansi-output', '\x1b[33m[2]\x1b[0m Blue Box - $150\r\n');
    socket.emit('ansi-output', '\x1b[33m[3]\x1b[0m Stolen Credit Cards - $200\r\n');
    socket.emit('ansi-output', '\x1b[33m[4]\x1b[0m Hacking Tools - $125\r\n');
    socket.emit('ansi-output', '\x1b[33m[M]\x1b[0m Back to Main Menu\r\n\r\n');
    socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
    gameState.currentMode = 'trading';
    gameState.previousMode = 'main_menu';
}
/**
 * Display BBS exploration
 */
export function displayBBSExploration(socket, gameState) {
    socket.emit('ansi-output', '\x1b[2J\x1b[H');
    socket.emit('ansi-output', '\x1b[36m-= BBS EXPLORATION =-\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', `\x1b[32mConnected to:\x1b[0m ${gameState.bbs.name}\r\n`);
    socket.emit('ansi-output', `\x1b[32mSecurity Level:\x1b[0m ${gameState.bbs.security}/10\r\n`);
    socket.emit('ansi-output', `\x1b[32mActive Users:\x1b[0m ${gameState.bbs.users}\r\n\r\n`);
    socket.emit('ansi-output', '\x1b[36m[R]\x1b[0m Read Messages\r\n');
    socket.emit('ansi-output', '\x1b[36m[P]\x1b[0m Post Message\r\n');
    socket.emit('ansi-output', '\x1b[36m[D]\x1b[0m Download Files\r\n');
    socket.emit('ansi-output', '\x1b[36m[C]\x1b[0m Chat Room\r\n');
    socket.emit('ansi-output', '\x1b[36m[H]\x1b[0m Hack This BBS\r\n');
    socket.emit('ansi-output', '\x1b[36m[M]\x1b[0m Back to Main Menu\r\n\r\n');
    socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
    gameState.currentMode = 'bbs_exploration';
    gameState.previousMode = 'main_menu';
}
/**
 * Display romance menu
 */
export function displayRomanceMenu(socket, gameState) {
    socket.emit('ansi-output', '\x1b[2J\x1b[H');
    socket.emit('ansi-output', '\x1b[36m-= SHADOW (ROMANCE) =-\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', `\x1b[32mRelationship Level:\x1b[0m ${gameState.shadow.relationship}/100\r\n\r\n`);
    if (gameState.shadow.relationship < 20) {
        socket.emit('ansi-output', '\x1b[33mYou haven\'t met Shadow yet.\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[33mPost messages on BBS or chat to find them...\x1b[0m\r\n\r\n');
    }
    else {
        socket.emit('ansi-output', '\x1b[35mShadow is a mysterious hacker you\'ve been talking to...\x1b[0m\r\n\r\n');
    }
    socket.emit('ansi-output', '\x1b[36m[M]\x1b[0m Send Message to Shadow\r\n');
    socket.emit('ansi-output', '\x1b[36m[R]\x1b[0m Read Shadow\'s Messages\r\n');
    socket.emit('ansi-output', '\x1b[36m[B]\x1b[0m Back to Main Menu\r\n\r\n');
    socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
    gameState.currentMode = 'romance';
    gameState.previousMode = 'main_menu';
}
/**
 * Display multiplayer menu
 */
export function displayMultiplayerMenu(socket, gameState) {
    socket.emit('ansi-output', '\x1b[2J\x1b[H');
    socket.emit('ansi-output', '\x1b[36m-= MULTIPLAYER BBS =-\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', '\x1b[33mMultiplayer features coming soon!\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', '\x1b[36m[M]\x1b[0m Back to Main Menu\r\n\r\n');
    socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
    gameState.currentMode = 'multiplayer';
    gameState.previousMode = 'main_menu';
}
