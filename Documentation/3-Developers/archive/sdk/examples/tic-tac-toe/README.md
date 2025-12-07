# Tic-Tac-Toe - Multiplayer Example

A turn-based multiplayer Tic-Tac-Toe game demonstrating the Network Engine's turn-based multiplayer capabilities.

## Features Demonstrated

### Network Engine
- **Turn-based multiplayer**: Automatic turn management
- **Room management**: Create and join game rooms
- **Player synchronization**: Real-time state updates
- **Message routing**: Direct player-to-player communication
- **Game flow control**: Ready states, game start, turn tracking

### Graphics Engine
- **ANSI board rendering**: Classic Tic-Tac-Toe grid
- **Player markers**: Color-coded X and O pieces
- **Dynamic updates**: Board state reflects all moves

### Game Logic
- **Win detection**: Row, column, and diagonal checks
- **Draw detection**: Full board without winner
- **Move validation**: Prevent invalid moves
- **Rematch system**: Play multiple games

## How to Play

### Starting a Game

1. **Create a game** - You'll be assigned 'X' and go first
2. **Wait for opponent** - Another player joins as 'O'
3. **Take turns** - Press 1-9 to place your mark

### Controls

- **1-9**: Place mark in corresponding cell
- **R**: Rematch (after game ends)
- **Q**: Quit

### Game Board

```
 1 │ 2 │ 3
───┼───┼───
 4 │ 5 │ 6
───┼───┼───
 7 │ 8 │ 9
```

Press the number corresponding to the cell you want to mark.

## Running the Game

### Development Mode
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Preview in Browser
```bash
npm run preview
```

Then select "tic-tac-toe" from the door list.

## Code Structure

```typescript
class TicTacToe {
  // Game state
  private board: Board           // 3x3 grid
  private mySymbol: Player       // 'X' or 'O'
  private gameOver: boolean

  // Network events
  onPlayerJoin()    // Opponent joins
  onMessage()       // Receive opponent's move
  onTurnStart()     // Your turn begins
  onGameStart()     // Both players ready

  // Game logic
  makeMove()        // Place your mark
  checkWin()        // Detect winner
  endTurn()         // Pass turn to opponent
}
```

## Network Flow

1. **Player 1** creates room → becomes 'X' (host)
2. **Player 2** joins room → becomes 'O'
3. **Game starts** when both players connected
4. **Turn loop**:
   - Current player makes move
   - Move sent to opponent via Network Engine
   - Check win/draw conditions
   - Turn advances automatically
5. **Game ends** → show result, offer rematch

## Network Engine Usage

### Initialize
```typescript
const network = new NetworkEngine({ mode: 'turn-based' });
await network.init(userId, userName);
```

### Create Room
```typescript
network.createRoom('game1', {
  maxPlayers: 2,
  turnBased: true,
  allowSpectators: false
});
```

### Join Room
```typescript
const rooms = network.listRooms();
network.joinRoom(rooms[0].config.id);
```

### Send Move
```typescript
network.sendTo(opponentId, 'move', {
  position: cellIndex,
  player: mySymbol
});
```

### End Turn
```typescript
network.endTurn(); // Automatically advances to next player
```

### Handle Events
```typescript
network.onPlayerJoin((player) => {
  console.log(`${player.name} joined!`);
});

network.onTurnStart((player) => {
  if (player.id === myId) {
    // My turn!
  }
});

network.onMessage((message) => {
  if (message.type === 'move') {
    handleOpponentMove(message.data);
  }
});
```

## Learning Points

This example teaches:

1. **Turn-based multiplayer**: How to manage sequential gameplay
2. **State synchronization**: Keeping both players in sync
3. **Event-driven architecture**: Responding to network events
4. **Room/session management**: Creating and joining game sessions
5. **Win condition handling**: Detecting and announcing game outcomes
6. **Rematch system**: Restarting games with same players

## Extending This Game

Ideas for enhancements:

- **Spectator mode**: Allow others to watch games
- **Tournament mode**: Best of 3/5 matches
- **Ranked play**: ELO rating system
- **Time limits**: Turn timer with timeout
- **Chat system**: Players can send messages
- **AI opponent**: Single-player mode vs computer
- **Different board sizes**: 4x4 or 5x5 variants
- **Game history**: Replay previous games
- **Statistics**: Track wins/losses per player

## Multiplayer Concepts

### Turn-Based vs Real-Time

This game uses **turn-based** mode where:
- Only one player acts at a time
- Network Engine manages turn order
- Moves are validated before turn ends
- No simultaneous actions needed

For **real-time** multiplayer (like space shooter):
- All players act simultaneously
- Network sends state updates every tick
- Latency compensation needed
- Use `mode: 'realtime'` instead

### Message Types

- **'move'**: Player made a move
- **'rematch'**: Player wants to play again
- **'chat'**: Text message (could add)
- **Custom**: Define your own message types

## License

MIT License - Free to use and modify for your own doors.
