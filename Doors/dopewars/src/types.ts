export interface DrugPrice {
  index:     number;
  name:      string;
  price:     number;
  cheap:     boolean;
  expensive: boolean;
}

export interface InventoryItem {
  index:      number;
  carried:    number;
  totalValue: number;
}

export interface GunItem {
  index:   number;
  carried: number;
}

export interface PlayerState {
  id:         string;
  name:       string;
  location:   number;
  cash:       number;
  debt:       number;
  bank:       number;
  health:     number;
  coatSize:   number;
  turn:       number;
  totalTurns: number;
  eventNum:   number;
  flags:      number;
  inCombat:   boolean;
  drugs:      InventoryItem[];
  guns:       GunItem[];
}

export interface MarketState {
  location: number;
  prices:   DrugPrice[];
}

export interface GameEvent {
  code:      number;
  msg:       string;
  isGlobal?: boolean;
}

export interface GameQuestion {
  code:   number;
  prompt: string;
}

export interface ActionResult {
  ok:        boolean;
  error?:    string;
  events:    GameEvent[];
  questions: GameQuestion[];
  newState:  PlayerState;
}

export interface PlayerSummary {
  id:       string;
  name:     string;
  location: number;
  health:   number;
  turn:     number;
}

export interface HighScore {
  id:         number;
  playerId:   string;
  bbsHandle:  string;
  score:      number;
  turns:      number;
  achievedAt: string;
}

export interface DopewarsConfig {
  numTurns:        number;
  startCash:       number;
  startDebt:       number;
  debtInterest:    number;
  bankInterest:    number;
  discordWebhook?: string;
  notifyLivechat:  boolean;
}
