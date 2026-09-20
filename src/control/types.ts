export interface ControlAccount {
  id: string;
  memberId?: string;
  username: string;
  name: string;
  role: "admin" | "member";
  canManageAdmins?: boolean;
  canCreateTables?: boolean;
  mustChangePassword?: boolean;
  teamId?: string | null;
  teamName?: string | null;
  createdAt?: number;
  suspended?: boolean;
  playBlocked?: boolean;
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

export interface ControlTeam {
  id: string;
  name: string;
  members?: number;
}

export interface MemberList {
  accounts: ControlAccount[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MemberFilters {
  q: string;
  team: string;
  status: "" | "active" | "suspended";
  page: number;
}

export interface ControlAudit {
  id: string;
  at: number;
  actorId: string;
  actorName: string;
  event: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
}

export type ReleasePlatform = "android" | "ios";

export interface ControlRelease {
  id: string;
  platform: ReleasePlatform;
  stage: "draft" | "published";
  name: string;
  packageId: string;
  version: string;
  build: string;
  size: number;
  sha256: string;
  notes: string;
  createdAt: number;
  createdBy: string | null;
  publishedAt: number | null;
  publishedBy: string | null;
  productUrl: string;
  downloadUrl: string;
  minimumOsVersion: string;
  distribution: string;
  signingMetadataPresent: boolean;
  provisioningExpiresAt: string | null;
  installationNote: string;
  validation: {
    canPublish: boolean;
    errors: string[];
    warnings: string[];
    currentBuild: string | null;
    sameBuild: boolean;
    requiresSameBuildConfirmation: boolean;
    installationVerificationRequired: boolean;
  };
}

export interface ReleaseEvent {
  id: string;
  releaseId: string;
  platform: ReleasePlatform;
  stage:
    | "staged"
    | "validated"
    | "published"
    | "discarded"
    | "publish_rejected"
    | "superseded";
  at: number;
  actor: string;
  version: string;
  build: string;
  sha256: string;
  size: number;
  notes: string;
  message: string;
}

export interface ReleaseList {
  current: ControlRelease[];
  drafts: ControlRelease[];
  history: ReleaseEvent[];
}
