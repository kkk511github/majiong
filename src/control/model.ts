import type {
  ControlAccount,
  ControlAnnouncement,
  MemberFilters,
} from "./types";

export function mayEditMember(
  actor: ControlAccount,
  member: ControlAccount,
): boolean {
  return (
    actor.role === "admin" &&
    (member.role !== "admin" || actor.canManageAdmins === true)
  );
}

export function mayChangeMemberAccess(
  actor: ControlAccount,
  member: ControlAccount,
): boolean {
  return (
    mayEditMember(actor, member) &&
    actor.id !== member.id &&
    member.username.toLowerCase() !== "guanli@1"
  );
}

export function memberQuery(filters: MemberFilters): string {
  const query = new URLSearchParams();
  if (filters.q.trim()) query.set("q", filters.q.trim());
  if (filters.team) query.set("team", filters.team);
  if (filters.status) query.set("status", filters.status);
  if(filters.targetVersion)query.set('targetVersion',filters.targetVersion);
  if(filters.versionStatus)query.set('versionStatus',filters.versionStatus);
  query.set("page", String(Math.max(1, Math.floor(filters.page))));
  return `/members?${query}`;
}

export function announcementIsDirty(
  item: ControlAnnouncement | null,
  title: string,
  body: string,
): boolean {
  return title !== (item?.draftTitle ?? "") || body !== (item?.draftBody ?? "");
}

export function announcementCanPublish(title: string, body: string): boolean {
  return (
    title.trim().length > 0 &&
    title.length <= 80 &&
    body.trim().length > 0 &&
    body.length <= 8000
  );
}

export function announcementLiveContent(item: ControlAnnouncement) {
  return item.status === "published"
    ? {
        title: item.publishedTitle ?? "",
        body: item.publishedBody ?? "",
        publishedAt: item.publishedAt,
      }
    : { title: item.draftTitle, body: item.draftBody, publishedAt: null };
}

export function displayTime(time?: number | null): string {
  if (!time || !Number.isFinite(time)) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(time);
}

export function displaySize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "大小未知";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
