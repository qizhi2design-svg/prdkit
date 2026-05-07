export type ViewerSkillConfig = {
  pageCreateSkillCommand: string;
  inspectCopySkillCommand: string;
  markCreateSkillCommand: string;
  markUpdateSkillCommand: string;
  copyTerminalGuide: string;
};

export type ProjectCloudConfig = {
  host?: string;
  projectId?: string;
  projectSlug?: string;
  projectName?: string;
  lastReleaseId?: string;
  lastPublishedAt?: string;
};

export type AuthenticatedUser = {
  id: number;
  email: string;
  name?: string | null;
};

export type AuthHostRecord = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: AuthenticatedUser;
  scopes: string[];
  lastValidatedAt?: string;
};

export type AuthStore = {
  hosts: Record<string, AuthHostRecord>;
};

export type CloudAuthStatus = "loggedOut" | "expired" | "active";

export type CloudProjectSummary = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  updatedAt?: string;
  prototypeCount?: number;
};

export type ReleaseItemStatus = "changed" | "unchanged" | "failed";

export type ReleasePreparePrototype = {
  path: string;
  name: string;
  contentHash: string;
  fileCount: number;
  markCount: number;
  message?: string;
  blobHashes: string[];
};

export type ReleasePrepareResult = {
  releaseId: string;
  projectId: string;
  uploadUrl: string;
  webUrl: string;
  releaseUrl: string;
  missingBlobHashes: string[];
  prototypes: Array<{
    path: string;
    name: string;
    status: "changed" | "unchanged";
    baseVersionId?: string | null;
    latestVersionId?: string | null;
    latestVersionNumber?: number | null;
  }>;
};

export type ReleaseCommitPayload = {
  message?: string;
  prototypes: Array<{
    path: string;
    name: string;
    contentHash: string;
    fileCount: number;
    markCount: number;
    filesManifest: Array<{
      relativePath: string;
      blobHash: string;
      size: number;
    }>;
    marksManifest: Array<{
      id: string;
      title: string;
      description: string;
      timestamp: number;
      fileName: string;
      relativePath: string;
      blobHash: string;
      selector?: string;
      domPath?: string;
    }>;
    blobHashes: string[];
    baseVersionId?: string | null;
  }>;
};

export type ReleaseCommitResult = {
  release: {
    id: string;
    projectId: string;
    message?: string | null;
    status: string;
    createdAt: string;
    webUrl: string;
    releaseUrl: string;
  };
  results: Array<{
    prototypePath: string;
    prototypeId: string;
    versionId?: string;
    versionNumber?: number;
    status: ReleaseItemStatus;
    message?: string | null;
  }>;
};

export type ReleaseStatusResult = ReleaseCommitResult & {
  project: {
    id: string;
    slug: string;
    name: string;
  };
};

export type PrdkitConfig = {
  version: 1;
  projectName: string;
  author: string;
  description?: string;
  productPositioning?: string;
  teamSize?: string;
  projectStage?: string;
  scaffoldRepo: string;
  templateRepo: string;
  defaultCreateDirs?: Record<string, string>;
  viewerSkills?: ViewerSkillConfig;
  cloud?: ProjectCloudConfig;
};

export type TemplateItem = {
  id: string;
  name: string;
  description?: string;
  file: string;
  output_suggestion?: string;
  tags?: string[];
};

export type TemplateManifest = {
  version: number;
  templates: TemplateItem[];
};

export type CreateTemplateVariables = {
  title: string;
  creator: string;
  label: string;
  status: string;
  templateId: string;
};
