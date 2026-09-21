export type Tile = number;
export type Seat = 0 | 1 | 2 | 3;
export interface Rules {
  id: "nj-casual-v1" | "nj-garden-v2" | "nj-open-v2" | "nj-garden-b-v3";
  rounds: number;
  turnSeconds: number;
  minimumFlowers: number;
  flowerDouble?: boolean;
  seaBottom?: boolean;
  twoBankrupt?: boolean;
  protectWinner?: boolean;
  biXiaHu?: "off" | "next" | "cumulative";
  doubleSidePayments?: boolean;
  successorDouble?: boolean;
  fourWinds?: boolean;
  discardPenalties?: boolean;
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
  /** Personal overtime bank for the entire table. Missing in legacy games: none. */
  overtimeSeconds?: number;
  /** Legacy input accepted for older clients; normalized to cumulative timing. */
  overtimePerTurn?: boolean;
  /** Keep the table visible and deal automatically between rounds. */
  continuousRounds?: boolean;
  allowDissolve: boolean;
  privacy: "open" | "lobby" | "all";
}
export interface TableConfig {
  experience?: { sourceCode: string };
  creatorId: string;
  groupId: string;
  /** Minimum number of waiting tables with at least one open seat in this group. */
  poolTarget?: number;
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
  poolTarget?: number;
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
  /** Distinguishes a direct exposed kong (still closed in v2) from an added pung. */
  added?: boolean;
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
  /** Cumulative garden external payments; never spendable as table balance. */
  externalScore?: number;
  zhaozhi?: boolean;
  passedHu: boolean;
  passedPung: number[];
  disconnectedAt?: number;
  joinedAt?: number;
  trusteeRounds?: number;
  awaitingReady?: boolean;
  /** Spent personal overtime for this table; only a new table refills the bank. */
  overtimeUsedMs?: number;
  trusteeLocked?: boolean;
  /** Fresh decision deadline after this player cancels automatic play. */
  resumedDeadline?: number;
}
export type Claim = "hu" | "kong" | "pung" | "pass";
export type Action =
  | { type: "discard"; tile: Tile }
  | { type: Claim }
  | { type: "selfKong"; tile: Tile }
  | { type: "zhaozhi" };
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
  major?: boolean;
  allIn?: boolean;
  snapshot?: boolean;
}
export interface ScoreTransfer {
  /** Missing means table balance, including legacy records. */
  scope?: "external";
  from: Seat;
  to: Seat;
  amount: number;
  reason:
    | "点炮"
    | "自摸"
    | "抢杠包三家"
    | "抢杠赔三家"
    | "三口承包"
    | "杠开包三家"
    | "直杠"
    | "补杠"
    | "暗杠"
    | "花杠"
    | "四连风"
    | "四家跟牌"
    | "四张同牌"
    | "清一色承包"
    | "全球独钓承包"
    | "天胡"
    | "保米";
}
export interface Result {
  winningTile?: Tile;
  /** Actual rob-kong win, independent of whether limited funds reached its winner. */
  robbedKong?: boolean;
  bankrupt?: boolean;
  reason: "hu" | "draw" | "dissolved" | "bankrupt";
  winners: Seat[];
  from?: Seat;
  details: Partial<Record<Seat, WinScore>>;
  deltas: number[];
  /** External changes for this round, separate from table-balance deltas. */
  externalDeltas?: number[];
  /** Absent on older rounds whose full transfer history was not recorded. */
  transfers?: ScoreTransfer[];
}
export interface RoundRecord {
  experience?: boolean;
  rules?: Rules;
  multiplier?: number;
  replayAvailable?: boolean;
  /** Revealed only after a completed round, for its hand review and final record. */
  hands?: { hand: Tile[]; melds: Meld[]; flowers: Tile[] }[];
  id: string;
  at: number;
  round: number;
  result: Result;
  names: string[];
  scores: number[];
  externalScores?: number[];
  /** Missing in pre-0.5 records, which started at zero and used no divisor. */
  initialScore?: number;
  /** Balance before the per-table fee. Legacy/practice falls back to initialScore. */
  settlementBase?: number;
  scoreDivisor?: number;
  playerIds?: string[];
  /** Stable public member numbers; account UUIDs remain internal identifiers. */
  memberIds?: string[];
  /** Added by authorized record endpoints only; never sent to member viewers. */
  teamNames?: string[];
  totalRounds?: number;
  tableName?: string;
  matchFinished?: boolean;
  endReason?: string;
}
export interface Account {
  id: string;
  memberId?: string;
  username: string;
  name: string;
  avatar?: string;
  role: "admin" | "member";
  mustChangePassword: boolean;
  canCreateTables?: boolean;
  teamId?: string | null;
  teamName?: string | null;
  playBlocked?: boolean;
  canPlay?: boolean;
  canManageAdmins?: boolean;
  createdAt?: number;
  suspended?: boolean;
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
  memberId?: string;
  username: string;
  name: string;
  teamId: string;
  teamName: string;
  rounds: number;
  tables: number;
  points: number;
}
export interface PointSummaryPage {
  rows: PointSummary[];
  total: number;
  page: number;
  pageSize: number;
  completedRounds: number;
  tables: number;
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
  /** Per-admin receipt; omitted entirely for member responses. */
  adminReadAt?: number | null;
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
  /** Dates obey the same viewer and room filter, independent of selected day. */
  dates?: { date: string; count: number }[];
  dateTotal?: number;
}
export interface MatchDetails {
  match: StoredRound;
  rounds: StoredRound[];
}
export interface Game {
  /** Versioned rule state is authoritative and persists across reconnect/restart. */
  ruleState?: NanjingRuleState;
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
  roundStartExternalScores?: number[];
  roundTransfers?: ScoreTransfer[];
  history: RoundRecord[];
  events: string[];
  dissolve?: { proposer: Seat; yes: Seat[]; expires: number };
}
export interface PublicPlayer extends Omit<
  Player,
  "hand" | "passedHu" | "passedPung"
> {
  avatar?: string;
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
  | "ruleState"
> {
  /** Public physical discards only; the retained single wait is never exposed. */
  globalAnchorDiscards?: GlobalAnchorDiscard[];
  roundMultiplier?: number;
  nextRoundMultiplier?: number;
  /** Only this viewer's original heavenly listening waits; other seats remain private. */
  earthlyWaits?: number[];
  admissionMessage?: string;
  players: (PublicPlayer | null)[];
  remaining: number;
  me: Seat;
  actions: Claim[];
  canZhaozhi?: boolean;
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
  globalAnchorDiscards?: GlobalAnchorDiscard[];
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
    | "zhaozhi"
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
    externalScore?: number;
  }[];
  result?: Result;
}
export interface RoundReplay {
  rules?: Rules;
  multiplier?: number;
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

export interface GlobalAnchorDiscard { seat: Seat; tile: Tile }
export interface NanjingRuleState {
  multiplier: number;
  nextMultiplier: number;
  nextReasons: string[];
  keepDealer: boolean;
  /** Only the server may read these waits; never include in a live public View. */
  heavenlyEligible: boolean;
  heavenlyWaits: Partial<Record<Seat, number[]>>;
  /** B profile: the first discarded tile declares the retained opening wait. */
  earthlyDeclared?: Partial<Record<Seat, boolean>>;
  discards: { seat: Seat; tile: Tile }[];
  ownDiscards: number[][];
  kongOccurred: boolean;
  /** Never send this private wait information in a public view. */
  deferredConcealed?: ScoreTransfer[];
  /** Armed only by a resolved fourth pung following three exposed pungs. */
  pendingGlobalPung?: Partial<Record<Seat, true>>;
  globalAnchors?: Partial<
    Record<Seat, {
      discardKind: number; waitKind: number; changed: boolean;
      /** Absent in old snapshots whose formation route was never recorded. */
      source?: "fourth-pung"; discardTile?: Tile;
    }>
  >;
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
  | { type: "createExperienceTable"; sourceCode: string }
  | { type: "tables" }
  | { type: "closeTable"; code: string }
  | { type: "join"; code: string; seat?: Seat }
  | { type: "ready" }
  | { type: "addBot" }
  | { type: "action"; action: Action; revision: number }
  | { type: "phrase"; game: string; phrase: import("./room-phrases").RoomPhraseId }
  | { type: "trustee"; enabled: boolean }
  | { type: "leave" }
  | { type: "dissolve"; agree: boolean }
  | { type: "ping"; sentAt?: number; sync?: boolean }
) & { requestId?: string };
export type ServerMessage = (
  | { type: "voice"; message: import("./room-voice").RoomVoiceMessage }
  | { type: "phrase"; message: import("./room-phrases").RoomPhraseMessage }
  | { type: "accountUpdated"; account: Account }
  | { type: "announcementsChanged" }
  | {
      type: "session";
      token: string;
      id: string;
      name: string;
      roomCode?: string;
      commandAck?: true;
      roomPhrases?: true;
      tableLobby?: true;
      timeSync?: true;
      serverVersion?: string;
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
  | { type: "pong"; sentAt?: number; synced?: true; roomCode?: string }
) & { serverNow?: number };
