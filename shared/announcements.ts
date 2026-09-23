export const ANNOUNCEMENT_TITLE_LIMIT = 80;
export const ANNOUNCEMENT_BODY_LIMIT = 8000;

export interface Announcement {
  id: string;
  title: string;
  body: string;
  revision: number;
  publishedAt: number;
  readRevision: number | null;
  unread: boolean;
}

export interface AnnouncementsResponse {
  announcements: Announcement[];
  unreadCount: number;
}

export interface ControlAnnouncement {
  id: string;
  status: "draft" | "published" | "withdrawn";
  draftTitle: string;
  draftBody: string;
  draftVersion: number;
  revision: number;
  publishedTitle: string | null;
  publishedBody: string | null;
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
  publishedBy: string | null;
  readStats?: AnnouncementReadStats | null;
}

export interface AnnouncementReadStats {
  revision: number;
  readCount: number;
  unreadCount: number;
  totalCount: number;
}

export interface AnnouncementReadPage {
  id: string;
  title: string;
  status: ControlAnnouncement['status'];
  stats: AnnouncementReadStats;
  readers: { id: string; memberId: string | null; name: string; username: string; readAt: number | null }[];
  total: number;
  page: number;
  pageSize: number;
}
