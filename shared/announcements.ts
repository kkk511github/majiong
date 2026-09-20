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
}
