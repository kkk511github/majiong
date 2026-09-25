import type { MatchDetails } from "./types";
export interface QueriedMember {
  id: string;
  memberId: string;
  name: string;
  username: string;
  deleted: boolean;
}
export interface MemberGameItem {
  gameId: string;
  code: string;
  finishedAt: number;
  tableName: string;
  rounds: number;
  reason: string;
  experience: boolean;
  names: string[];
  memberRecorded: number | null;
}
export interface MemberGamePage {
  member: QueriedMember;
  from: string;
  to: string;
  timeZone: "Asia/Shanghai";
  totalTables: number;
  daily: { date: string; tables: number }[];
  page: number;
  pageSize: number;
  items: MemberGameItem[];
}
export interface MemberGameDetail {
  member: QueriedMember;
  details: MatchDetails;
}
