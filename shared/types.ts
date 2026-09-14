export type Tile = number;
export type Seat = 0 | 1 | 2 | 3;
export interface Rules {
  id: "nj-casual-v1";
  rounds: number;
  turnSeconds: number;
  minimumFlowers: number;
  flowerDouble?: boolean;
  seaBottom?: boolean;
  twoBankrupt?: boolean;
  protectWinner?: boolean;
}
export const DEFAULT_RULES: Rules = {
  id: "nj-casual-v1",
  rounds: 4,
  turnSeconds: 30,
  minimumFlowers: 4,
};
export interface TableSettings {
  name: string;
  visibility: "public" | "code";
  readyMode: "auto" | "manual";
  autoRenew: boolean;
  resultSeconds: 5 | 10;
  offlineStart: boolean;
  kickOffline: boolean;
  kickUnready: boolean;
  kickAfterSeconds: number;
  trusteeMode: "match" | "round" | "dissolve" | "afterRounds" | "disabled";
  trusteeRounds: number;
  /** Per-table recording ratio; independent of hand scoring. */
  scoreMultiplier?: 0.2 | 0.5 | 1;
  /** Missing in legacy games: no cumulative time bank. */
  overtimeSeconds?: number;
  /** New tables get a fresh overtime countdown for each decision. */
  overtimePerTurn?: boolean;
  /** Keep the table visible and deal automatically between rounds. */
  continuousRounds?: boolean;
  allowDissolve: boolean;
  privacy: "open" | "lobby" | "all";
}
export interface TableConfig {
  creatorId: string;
  groupId: string;
  number: number;
  createdAt: number;
  settings: TableSettings;
  closed?: boolean;
  settledRound?: number;
  endReason?: string;
  finishedAt?: number;
  readyDeadline?: number;
}
export interface TableSummary {
  code: string;
  name: string;
  number: number;
  phase: Game["phase"];
  round: number;
  rules: Rules;
  settings: TableSettings;
  managed: boolean;
  seats: ({
    name: string;
    online: boolean;
    ready: boolean;
    isMe: boolean;
  } | null)[];
}
export interface Meld {
  type: "pung" | "kong";
  tiles: Tile[];
  from: Seat;
  concealed: boolean;
}
export interface Player {
  id: string;
  name: string;
  bot: boolean;
  ready: boolean;
  online: boolean;
  trustee: boolean;
  hand: Tile[];
  flowers: Tile[];
  melds: Meld[];
  discards: Tile[];
  score: number;
  passedHu: boolean;
  passedPung: number[];
  disconnectedAt?: number;
  joinedAt?: number;
  trusteeRounds?: number;
  awaitingReady?: boolean;
  overtimeUsedMs?: number;
  trusteeLocked?: boolean;
  /** Fresh decision deadline after this player cancels automatic play. */
  resumedDeadline?: number;
}
export type Claim = "hu" | "kong" | "pung" | "pass";
export type Action =
  | { type: "discard"; tile: Tile }
  | { type: Claim }
  | { type: "selfKong"; tile: Tile };
export interface Pending {
  openedAtRevision: number;
  tile: Tile;
  from: Seat;
  kind: "discard" | "robKong";
  offers: Partial<Record<Seat, Claim[]>>;
  replies: Partial<Record<Seat, Claim>>;
}
export interface WinScore {
  total: number;
  items: { label: string; value: number }[];
  kinds: number[];
}
export interface ScoreTransfer {
  from: Seat;
  to: Seat;
  amount: number;
  reason:
    | "点炮"
    | "自摸"
    | "抢杠包三家"
    | "三口承包"
    | "杠开包三家"
    | "直杠"
    | "补杠"
    | "暗杠"
    | "花杠"
    | "保米";
}
export interface Result {
  winningTile?: Tile;
  bankrupt?: boolean;
  reason: "hu" | "draw" | "dissolved" | "bankrupt";
  winners: Seat[];
  from?: Seat;
  details: Partial<Record<Seat, WinScore>>;
  deltas: number[];
  /** Absent on older rounds whose full transfer history was not recorded. */
  transfers?: ScoreTransfer[];
}
export interface RoundRecord {
  replayAvailable?: boolean;
  /** Revealed only after a completed round, for its hand review and final record. */
  hands?: { hand: Tile[]; melds: Meld[]; flowers: Tile[] }[];
  id: string;
  at: number;
  round: number;
  result: Result;
  names: string[];
  scores: number[];
  /** Missing in pre-0.5 records, which started at zero and used no divisor. */
  initialScore?: number;
  /** Balance before the per-table fee. Legacy/practice falls back to initialScore. */
  settlementBase?: number;
  scoreDivisor?: number;
  playerIds?: string[];
  totalRounds?: number;
  tableName?: string;
  matchFinished?: boolean;
  endReason?: string;
}
export interface Account {
  id: string;
  username: string;
  name: string;
  role: "admin" | "member";
  mustChangePassword: boolean;
  canCreateTables?: boolean;
  teamId?: string | null;
  teamName?: string | null;
  playBlocked?: boolean;
  canPlay?: boolean;
  canManageAdmins?: boolean;
}
export interface Team {
  id: string;
  name: string;
  members: number;
}
export interface ClubMembersPage {
  accounts: Account[];
  total: number;
  page: number;
  pageSize: number;
}
export interface PointSummary {
  accountId: string;
  username: string;
  name: string;
  teamId: string;
  teamName: string;
  rounds: number;
  points: number;
}
export interface PointSummaryPage {
  rows: PointSummary[];
  total: number;
  page: number;
  pageSize: number;
  completedRounds: number;
  playerRounds: number;
  points: number;
}
export type TablePermissionAccount = Pick<
  Account,
  "id" | "username" | "name" | "role" | "canCreateTables"
>;
export interface TablePermissionsPage {
  accounts: TablePermissionAccount[];
  total: number;
  page: number;
  pageSize: number;
}
export interface StoredRound {
  game: string;
  code: string;
  me: number;
  practice: boolean;
  record: RoundRecord;
}
export interface RecordsPage {
  records: StoredRound[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Game {
  /** Server/local engine only. Never included in a live player View. */
  replay?: RoundReplay;
  version: 1;
  id: string;
  code: string;
  ownerId: string | null;
  initialScore?: number;
  /** Balance before the per-table fee. Legacy/practice falls back to initialScore. */
  settlementBase?: number;
  scoreDivisor?: number;
  table?: TableConfig;
  rules: Rules;
  phase: "waiting" | "playing" | "claiming" | "ended" | "finished";
  players: (Player | null)[];
  wall: Tile[];
  dealer: Seat;
  turn: Seat;
  round: number;
  pending?: Pending;
  lastDiscard?: { tile: Tile; seat: Seat };
  lastDraw?: Tile;
  replacement?: { type: "flower" | "kong"; from?: Seat; direct?: boolean };
  canSelfWin: boolean;
  deadline: number;
  overtimeCharged?: Seat[];
  revision: number;
  result?: Result;
  roundStartScores: number[];
  roundTransfers?: ScoreTransfer[];
  history: RoundRecord[];
  events: string[];
  dissolve?: { proposer: Seat; yes: Seat[]; expires: number };
}
export interface PublicPlayer extends Omit<
  Player,
  "hand" | "passedHu" | "passedPung"
> {
  hand: Tile[];
  handCount: number;
}
export interface View extends Omit<
  Game,
  | "wall"
  | "players"
  | "pending"
  | "lastDraw"
  | "replacement"
  | "canSelfWin"
  | "replay"
> {
  admissionMessage?: string;
  players: (PublicPlayer | null)[];
  remaining: number;
  me: Seat;
  actions: Claim[];
  selfKongs: Tile[];
  canDiscard: boolean;
  lastDraw?: Tile;
  pending?: {
    tile: Tile;
    from: Seat;
    kind: "discard" | "robKong";
    answered: boolean;
  };
}

export interface ReplayFrame {
  at: number;
  type:
    | "start"
    | "draw"
    | "flower"
    | "discard"
    | "pung"
    | "kong"
    | "concealedKong"
    | "addedKong"
    | "claim"
    | "pass"
    | "finish";
  seat?: Seat;
  tile?: Tile;
  turn: Seat;
  remaining: number;
  players: {
    hand: Tile[];
    melds: Meld[];
    flowers: Tile[];
    discards: Tile[];
    score: number;
  }[];
  result?: Result;
}
export interface RoundReplay {
  version: 1;
  id: string;
  code: string;
  round: number;
  startedAt: number;
  endedAt?: number;
  names: string[];
  frames: ReplayFrame[];
  summaryOnly?: boolean;
}
export type ClientMessage = (
  | { type: "hello"; token?: string; name: string }
  | { type: "create"; rules?: Partial<Rules> }
  | {
      type: "createTables";
      rules?: Partial<Rules>;
      settings: Partial<TableSettings>;
      count: number;
      creationId: string;
    }
  | { type: "tables" }
  | { type: "closeTable"; code: string }
  | { type: "join"; code: string; seat?: Seat }
  | { type: "ready" }
  | { type: "addBot" }
  | { type: "action"; action: Action; revision: number }
  | { type: "trustee"; enabled: boolean }
  | { type: "leave" }
  | { type: "dissolve"; agree: boolean }
  | { type: "ping"; sentAt?: number }
) & { requestId?: string };
export type ServerMessage = (
  | { type: "accountUpdated"; account: Account }
  | {
      type: "session";
      token: string;
      id: string;
      name: string;
      roomCode?: string;
      commandAck?: true;
      tableLobby?: true;
      timeSync?: true;
      account?: Account;
    }
  | { type: "state"; state: View }
  | {
      type: "error";
      message: string;
      requestId?: string;
      code?: "AUTH_REQUIRED";
    }
  | { type: "ack"; requestId: string }
  | { type: "tables"; tables: TableSummary[] }
  | { type: "tablesCreated"; codes: string[] }
  | {
      type: "records";
      records: {
        game: string;
        code: string;
        me: number;
        practice: boolean;
        record: RoundRecord;
      }[];
    }
  | { type: "left"; lobby?: boolean; message?: string }
  | { type: "pong"; sentAt?: number }
) & { serverNow?: number };
