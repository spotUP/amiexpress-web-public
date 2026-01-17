/**
 * PhreakWars Input Handlers Module
 *
 * All input handling logic for game modes.
 */
import { displayMainMenu, displayPhreakingMenu, displayProgrammingMenu, displayTradingMenu, displayRomanceMenu, displayMultiplayerMenu, displayUpgradesMenu, displayBBSExploration, displayStats, displayHelp } from './ui';
import { startTextMinigame } from './minigames';
import { checkDailyLimit, deletePlayer, displayDailyLimits } from './player';
// Shadow message templates
export const shadowMessageTemplates = [
    {
        subject: "Looking for Shadow",
        body: "Hey, I've heard rumors about someone called Shadow. Mysterious hacker type. Anyone know how to get in touch?",
        relationshipBoost: 5,
        replyChance: 0.8,
        replySubject: "Re: Looking for Shadow",
        replyBody: "I heard you're looking for me... ;) What do you want to know?"
    },
    {
        subject: "Shadow - Let's Talk",
        body: "Shadow, if you're reading this, I think you're amazing. Your hacking skills are legendary. Want to chat sometime?",
        relationshipBoost: 10,
        replyChance: 0.9,
        replySubject: "Re: Shadow - Let's Talk",
        replyBody: "Flattery will get you everywhere... but only if you're serious. What makes you think you can keep up with me?"
    },
    {
        subject: "Shadow - I Need Your Help",
        body: "Shadow, I could really use your expertise on a tricky hack. You're the only one I trust. Can we meet?",
        relationshipBoost: 15,
        replyChance: 1.0,
        replySubject: "Re: Shadow - I Need Your Help",
        replyBody: "Trust is a dangerous word in our world... but I'm intrigued. Tell me more about this 'tricky hack' of yours."
    },
    {
        subject: "Shadow - Thinking of You",
        body: "Just wanted to say I can't stop thinking about our last conversation. You're different from everyone else here.",
        relationshipBoost: 8,
        replyChance: 0.7,
        replySubject: "Re: Shadow - Thinking of You",
        replyBody: "That's... sweet. Most people just want to use me for my skills. You might be different. Don't prove me wrong."
    },
    {
        subject: "Shadow - Let's Hack Together",
        body: "Shadow, I have an idea for a big score. But I need someone I can trust. You in?",
        relationshipBoost: 12,
        replyChance: 0.95,
        replySubject: "Re: Shadow - Let's Hack Together",
        replyBody: "A big score, huh? I'm listening... but if this is a setup, you'll regret it. What's the target?"
    }
];
/**
 * Handle main menu input
 */
export function handleMainMenu(socket, gameState, input) {
    switch (input) {
        case 'P':
            displayPhreakingMenu(socket, gameState);
            break;
        case 'B':
            displayBBSExploration(socket, gameState);
            break;
        case 'C':
            displayProgrammingMenu(socket, gameState);
            break;
        case 'T':
            displayTradingMenu(socket, gameState);
            break;
        case 'U':
            displayUpgradesMenu(socket, gameState);
            break;
        case 'S':
            displayRomanceMenu(socket, gameState);
            break;
        case 'M':
            displayMultiplayerMenu(socket, gameState);
            break;
        case 'I':
            displayStats(socket, gameState);
            break;
        case 'L':
            displayDailyLimits(socket, gameState);
            gameState.currentMode = 'waiting';
            socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
            break;
        case 'H':
            displayHelp(socket, gameState);
            break;
        case 'Q':
            socket.emit('ansi-output', '\r\n\x1b[33mThanks for playing Phreak Wars!\x1b[0m\r\n');
            socket.emit('ansi-output', '\x1b[36m"2600 Hz is the key to the kingdom..."\x1b[0m\r\n\r\n');
            socket.emit('ansi-output', '\x1b[32mPress any key to exit...\x1b[0m');
            gameState.currentMode = 'quit';
            break;
        default:
            socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice. Press H for help.\x1b[0m\r\n');
            displayMainMenu(socket, gameState);
    }
}
/**
 * Handle character creation
 */
export function handleCharacterCreation(socket, gameState, data) {
    if (!gameState.player.handle) {
        const handle = data.trim();
        if (handle.length < 3 || handle.length > 15) {
            socket.emit('ansi-output', '\r\n\x1b[31mHandle must be 3-15 characters long.\x1b[0m\r\n');
            socket.emit('ansi-output', '\x1b[33mEnter your hacker handle:\x1b[0m ');
            return;
        }
        gameState.player.handle = handle;
        socket.emit('ansi-output', `\r\n\x1b[32mWelcome, ${handle}!\x1b[0m\r\n\r\n`);
        socket.emit('ansi-output', '\x1b[36mYou are a curious teenager in 1985 with access to a computer and modem.\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mYour journey from novice to master hacker begins now...\x1b[0m\r\n\r\n');
        socket.emit('ansi-output', '\x1b[32mPress any key to start...\x1b[0m');
        gameState.currentMode = 'main_menu';
    }
}
/**
 * Handle phreaking input
 */
export function handlePhreaking(socket, gameState, input) {
    switch (input) {
        case 'R':
            if (checkDailyLimit(gameState, 'PHREAKING_ATTEMPTS', gameState.dailyLimits.phreakingAttempts)) {
                socket.emit('ansi-output', '\r\n\x1b[31mDAILY LIMIT REACHED!\x1b[0m\r\n');
                socket.emit('ansi-output', '\x1b[36mCome back tomorrow for more!\x1b[0m\r\n');
                socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
                gameState.currentMode = 'waiting';
                break;
            }
            gameState.dailyLimits.phreakingAttempts++;
            startTextMinigame(socket, gameState, 'redbox');
            return;
        case 'B':
            if (!gameState.player.computer.hasBlueBox) {
                socket.emit('ansi-output', '\r\n\x1b[31mYou need a blue box! Visit the black market.\x1b[0m\r\n');
                socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
                gameState.currentMode = 'waiting';
            }
            else {
                if (checkDailyLimit(gameState, 'PHREAKING_ATTEMPTS', gameState.dailyLimits.phreakingAttempts)) {
                    socket.emit('ansi-output', '\r\n\x1b[31mDAILY LIMIT REACHED!\x1b[0m\r\n');
                    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
                    gameState.currentMode = 'waiting';
                    break;
                }
                gameState.dailyLimits.phreakingAttempts++;
                startTextMinigame(socket, gameState, 'bluebox');
            }
            return;
        case 'T':
            startTextMinigame(socket, gameState, 'tonegen');
            return;
        case 'H':
            if (checkDailyLimit(gameState, 'HACKING_ATTEMPTS', gameState.dailyLimits.hackingAttempts)) {
                socket.emit('ansi-output', '\r\n\x1b[31mDAILY LIMIT REACHED!\x1b[0m\r\n');
                socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
                gameState.currentMode = 'waiting';
                break;
            }
            gameState.dailyLimits.hackingAttempts++;
            startTextMinigame(socket, gameState, 'hack');
            return;
        case 'M':
            displayMainMenu(socket, gameState);
            return;
        default:
            socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
            displayPhreakingMenu(socket, gameState);
    }
}
/**
 * Handle programming input
 */
export function handleProgramming(socket, gameState, input) {
    switch (input) {
        case 'P':
            if (checkDailyLimit(gameState, 'PROGRAMMING_SESSIONS', gameState.dailyLimits.programmingSessions)) {
                socket.emit('ansi-output', '\r\n\x1b[31mDAILY LIMIT REACHED!\x1b[0m\r\n');
                socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
                gameState.currentMode = 'waiting';
                break;
            }
            gameState.dailyLimits.programmingSessions++;
            startTextMinigame(socket, gameState, 'program');
            return;
        case 'M':
            displayMainMenu(socket, gameState);
            return;
        default:
            socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
            displayProgrammingMenu(socket, gameState);
    }
}
/**
 * Handle trading input
 */
export function handleTrading(socket, gameState, input) {
    if (checkDailyLimit(gameState, 'TRADING_VISITS', gameState.dailyLimits.tradingVisits)) {
        socket.emit('ansi-output', '\r\n\x1b[31mDAILY LIMIT REACHED!\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        gameState.currentMode = 'waiting';
        return;
    }
    switch (input) {
        case '1':
            if (gameState.player.money >= 75) {
                gameState.player.money -= 75;
                gameState.player.computer.hasRedBox = true;
                gameState.player.inventory.push('Red Box');
                socket.emit('ansi-output', '\r\n\x1b[32mPurchased Red Box for $75!\x1b[0m\r\n');
                gameState.dailyLimits.tradingVisits++;
            }
            else {
                socket.emit('ansi-output', '\r\n\x1b[31mNot enough money!\x1b[0m\r\n');
            }
            break;
        case '2':
            if (gameState.player.money >= 150) {
                gameState.player.money -= 150;
                gameState.player.computer.hasBlueBox = true;
                gameState.player.inventory.push('Blue Box');
                socket.emit('ansi-output', '\r\n\x1b[32mPurchased Blue Box for $150!\x1b[0m\r\n');
                gameState.dailyLimits.tradingVisits++;
            }
            else {
                socket.emit('ansi-output', '\r\n\x1b[31mNot enough money!\x1b[0m\r\n');
            }
            break;
        case 'M':
            displayMainMenu(socket, gameState);
            return;
        default:
            socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
    }
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    gameState.currentMode = 'waiting';
}
/**
 * Handle upgrades input
 */
export function handleUpgrades(socket, gameState, input) {
    switch (input) {
        case '1':
            if (gameState.player.money >= 50) {
                gameState.player.money -= 50;
                gameState.player.computer.ram += 64;
                socket.emit('ansi-output', `\r\n\x1b[32mRAM upgraded to ${gameState.player.computer.ram}KB!\x1b[0m\r\n`);
            }
            else {
                socket.emit('ansi-output', '\r\n\x1b[31mNot enough money!\x1b[0m\r\n');
            }
            break;
        case '2':
            if (gameState.player.money >= 30) {
                gameState.player.money -= 30;
                gameState.player.computer.storage += 170;
                socket.emit('ansi-output', `\r\n\x1b[32mStorage upgraded to ${gameState.player.computer.storage}KB!\x1b[0m\r\n`);
            }
            else {
                socket.emit('ansi-output', '\r\n\x1b[31mNot enough money!\x1b[0m\r\n');
            }
            break;
        case '3':
            if (gameState.player.money >= 100) {
                gameState.player.money -= 100;
                gameState.player.computer.modemSpeed += 300;
                socket.emit('ansi-output', `\r\n\x1b[32mModem upgraded to ${gameState.player.computer.modemSpeed} baud!\x1b[0m\r\n`);
            }
            else {
                socket.emit('ansi-output', '\r\n\x1b[31mNot enough money!\x1b[0m\r\n');
            }
            break;
        case 'M':
            displayMainMenu(socket, gameState);
            return;
        default:
            socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
    }
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    gameState.currentMode = 'waiting';
}
/**
 * Handle BBS exploration input
 */
export function handleBBSExploration(socket, gameState, input) {
    switch (input) {
        case 'R':
            socket.emit('ansi-output', '\r\n\x1b[36m-= MESSAGES =-\x1b[0m\r\n\r\n');
            if (gameState.bbs.messages.length === 0) {
                socket.emit('ansi-output', 'No messages.\r\n');
            }
            else {
                gameState.bbs.messages.forEach((msg, idx) => {
                    socket.emit('ansi-output', `\x1b[32m[${idx + 1}]\x1b[0m ${msg.subject} (${msg.author})\r\n`);
                });
            }
            socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
            gameState.currentMode = 'waiting';
            break;
        case 'P':
            if (checkDailyLimit(gameState, 'POSTS', gameState.dailyLimits.posts)) {
                socket.emit('ansi-output', '\r\n\x1b[31mDAILY LIMIT REACHED!\x1b[0m\r\n');
                socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
                gameState.currentMode = 'waiting';
                break;
            }
            displayMessageChoiceMenu(socket, gameState);
            return;
        case 'H':
            if (checkDailyLimit(gameState, 'BBS_HACKS', gameState.dailyLimits.bbsHacks)) {
                socket.emit('ansi-output', '\r\n\x1b[31mDAILY LIMIT REACHED!\x1b[0m\r\n');
                socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
                gameState.currentMode = 'waiting';
                break;
            }
            gameState.dailyLimits.bbsHacks++;
            startTextMinigame(socket, gameState, 'bbs_hack');
            return;
        case 'M':
            displayMainMenu(socket, gameState);
            return;
        default:
            socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
            displayBBSExploration(socket, gameState);
    }
}
/**
 * Display message choice menu for posting
 */
export function displayMessageChoiceMenu(socket, gameState) {
    socket.emit('ansi-output', '\x1b[2J\x1b[H');
    socket.emit('ansi-output', '\x1b[36m-= POST MESSAGE TO BBS =-\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', '\x1b[32mChoose a message to post:\x1b[0m\r\n\r\n');
    shadowMessageTemplates.forEach((template, index) => {
        socket.emit('ansi-output', `\x1b[33m[${index + 1}]\x1b[0m ${template.subject}\r\n`);
        socket.emit('ansi-output', `    ${template.body.substring(0, 60)}...\r\n\r\n`);
    });
    socket.emit('ansi-output', '\x1b[33m[C]\x1b[0m Custom message (free-form)\r\n');
    socket.emit('ansi-output', '\x1b[33m[B]\x1b[0m Back to BBS menu\r\n\r\n');
    socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
    gameState.currentMode = 'message_choice';
    gameState.previousMode = 'bbs_exploration';
}
/**
 * Handle message choice input
 */
export function handleMessageChoice(socket, gameState, input) {
    if (input === 'B') {
        displayBBSExploration(socket, gameState);
        return;
    }
    if (input === 'C') {
        socket.emit('ansi-output', '\r\n\x1b[36m-= CUSTOM MESSAGE =-\x1b[0m\r\n\r\n');
        socket.emit('ansi-output', '\x1b[33mEnter subject:\x1b[0m ');
        gameState.currentMode = 'posting_subject';
        gameState.previousMode = 'message_choice';
        return;
    }
    const choice = parseInt(input) - 1;
    if (isNaN(choice) || choice < 0 || choice >= shadowMessageTemplates.length) {
        socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
        displayMessageChoiceMenu(socket, gameState);
        return;
    }
    const template = shadowMessageTemplates[choice];
    gameState.dailyLimits.posts++;
    gameState.bbs.messages.push({
        subject: template.subject,
        body: template.body,
        author: gameState.player.handle,
        timestamp: new Date()
    });
    gameState.shadow.relationship = Math.min(100, gameState.shadow.relationship + template.relationshipBoost);
    socket.emit('ansi-output', `\r\n\x1b[32mMessage posted successfully!\x1b[0m\r\n`);
    socket.emit('ansi-output', `\x1b[32mShadow relationship increased by ${template.relationshipBoost} points!\x1b[0m\r\n`);
    if (Math.random() < template.replyChance) {
        gameState.shadow.pendingReplies.push({
            subject: template.replySubject,
            body: template.replyBody,
            timestamp: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
        socket.emit('ansi-output', '\x1b[35m(Shadow might reply when you check back later...)\x1b[0m\r\n');
    }
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    gameState.currentMode = 'waiting';
}
/**
 * Handle posting subject input
 */
export function handlePostingSubject(socket, gameState, data) {
    const subject = data.trim();
    if (subject.length === 0) {
        socket.emit('ansi-output', '\r\n\x1b[31mSubject cannot be empty.\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[33mEnter subject:\x1b[0m ');
        return;
    }
    if (subject.length > 50) {
        socket.emit('ansi-output', '\r\n\x1b[31mSubject too long (max 50 characters).\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[33mEnter subject:\x1b[0m ');
        return;
    }
    gameState.postingSubject = subject;
    socket.emit('ansi-output', `\r\n\x1b[32mSubject: "${subject}"\x1b[0m\r\n`);
    socket.emit('ansi-output', '\x1b[33mEnter message body (end with /END on a new line):\x1b[0m\r\n');
    gameState.currentMode = 'posting_body';
    gameState.inputBuffer = '';
}
/**
 * Handle posting body input
 */
export function handlePostingBody(socket, gameState, data) {
    if (data.trim().toUpperCase() === '/END') {
        const subject = gameState.postingSubject;
        const body = gameState.inputBuffer.trim();
        if (body.length === 0) {
            socket.emit('ansi-output', '\r\n\x1b[31mMessage body cannot be empty.\x1b[0m\r\n');
            socket.emit('ansi-output', '\x1b[33mEnter message body (end with /END on a new line):\x1b[0m\r\n');
            return;
        }
        gameState.dailyLimits.posts++;
        gameState.bbs.messages.push({
            subject: subject,
            body: body,
            author: gameState.player.handle,
            timestamp: new Date()
        });
        socket.emit('ansi-output', '\r\n\x1b[32mMessage posted successfully!\x1b[0m\r\n');
        delete gameState.postingSubject;
        gameState.inputBuffer = '';
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        gameState.currentMode = 'waiting';
    }
    else {
        gameState.inputBuffer += data + '\n';
    }
}
/**
 * Handle romance input
 */
export function handleRomance(socket, gameState, input) {
    switch (input) {
        case 'M':
            displayMessageChoiceMenu(socket, gameState);
            return;
        case 'R':
            socket.emit('ansi-output', '\r\n\x1b[36m-= SHADOW\'S MESSAGES =-\x1b[0m\r\n\r\n');
            if (gameState.shadow.pendingReplies.length === 0) {
                socket.emit('ansi-output', 'No messages from Shadow yet.\r\n');
            }
            else {
                gameState.shadow.pendingReplies.forEach((msg, idx) => {
                    socket.emit('ansi-output', `\x1b[35m[${idx + 1}]\x1b[0m ${msg.subject}\r\n`);
                    socket.emit('ansi-output', `${msg.body}\r\n\r\n`);
                });
            }
            socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
            gameState.currentMode = 'waiting';
            break;
        case 'B':
            displayMainMenu(socket, gameState);
            return;
        default:
            socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
            displayRomanceMenu(socket, gameState);
    }
}
/**
 * Handle multiplayer input
 */
export function handleMultiplayer(socket, gameState, input) {
    switch (input) {
        case 'M':
            displayMainMenu(socket, gameState);
            return;
        default:
            socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
            displayMultiplayerMenu(socket, gameState);
    }
}
/**
 * Handle stats menu input
 */
export function handleStatsMenu(socket, gameState, input) {
    switch (input) {
        case 'D':
            socket.emit('ansi-output', '\r\n\x1b[31m-= DELETE PLAYER =-\x1b[0m\r\n\r\n');
            socket.emit('ansi-output', '\x1b[31mWARNING: This will permanently delete your current player!\x1b[0m\r\n');
            socket.emit('ansi-output', '\x1b[33m[Y]\x1b[0m Yes, delete player and create new\r\n');
            socket.emit('ansi-output', '\x1b[33m[N]\x1b[0m No, keep current player\r\n\r\n');
            socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
            gameState.currentMode = 'delete_confirmation';
            return;
        case 'M':
            displayMainMenu(socket, gameState);
            return;
        default:
            socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
            displayStats(socket, gameState);
    }
}
/**
 * Handle delete confirmation
 */
export function handleDeleteConfirmation(socket, gameState, input, session) {
    switch (input) {
        case 'Y':
            const userId = String(session.user.id);
            const newGameState = deletePlayer(userId);
            socket.emit('ansi-output', '\r\n\x1b[32mPlayer deleted successfully!\x1b[0m\r\n');
            socket.emit('ansi-output', '\x1b[32mCreating new player...\x1b[0m\r\n\r\n');
            socket.emit('ansi-output', '\x1b[33mEnter your hacker handle:\x1b[0m ');
            newGameState.currentMode = 'character_creation';
            session.tempData.gameState = newGameState;
            return;
        case 'N':
            socket.emit('ansi-output', '\r\n\x1b[32mPlayer deletion cancelled.\x1b[0m\r\n');
            displayStats(socket, gameState);
            return;
        default:
            socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
            socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
            gameState.currentMode = 'delete_confirmation';
    }
}
/**
 * Handle waiting mode (any key press continues)
 */
export function handleWaiting(socket, gameState, input) {
    switch (gameState.previousMode) {
        case 'phreaking':
            displayPhreakingMenu(socket, gameState);
            break;
        case 'bbs_exploration':
            displayBBSExploration(socket, gameState);
            break;
        case 'programming':
            displayProgrammingMenu(socket, gameState);
            break;
        case 'trading':
            displayTradingMenu(socket, gameState);
            break;
        case 'romance':
            displayRomanceMenu(socket, gameState);
            break;
        case 'multiplayer':
            displayMultiplayerMenu(socket, gameState);
            break;
        case 'upgrades':
            displayUpgradesMenu(socket, gameState);
            break;
        default:
            displayMainMenu(socket, gameState);
    }
}
