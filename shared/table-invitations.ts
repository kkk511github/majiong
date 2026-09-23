import type { TableSummary } from './types';

export const TABLE_INVITE_TTL_MS = 60_000;
export interface InvitePerson { memberId: string; name: string; avatar?: string }
export interface OnlineInvitePeer extends InvitePerson {
  status: 'available' | 'busy' | 'pending';
  expiresAt?: number;
}
export type TableInviteStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'unavailable';
export interface TableInvitation {
  id: string;
  direction: 'incoming' | 'outgoing';
  inviter: InvitePerson;
  recipient: InvitePerson;
  table: TableSummary;
  expiresAt: number;
  status: TableInviteStatus;
  reason?: string;
}
