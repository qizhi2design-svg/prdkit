export type ViewerSkillConfig = {
  pageCreateSkillCommand: string;
  inspectCopySkillCommand: string;
  markCreateSkillCommand: string;
  markUpdateSkillCommand: string;
  copyTerminalGuide: string;
};

export type PrdkitCloudConfig = {
  version: 1;
  host: string;
  projectId?: string;
  projectSlug?: string;
  projectName?: string;
  lastReleaseId?: string;
  lastPublishedAt?: string;
};

export type PerHostProjectMeta = {
  projectId?: string;
  projectSlug?: string;
  projectName?: string;
  lastReleaseId?: string;
  lastPublishedAt?: string;
};

export type PrdkitGlobalConfig = {
  cloud?: {
    defaultHost?: string;
    perHost?: Record<string, PerHostProjectMeta>;
  };
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

export type CloudCloneManifest = {
  version: 1;
  projectSlug: string;
  versionNumber: number | null;
  entries: Array<{
    archiveDir: string;
    prototypePath: string;
  }>;
};

export type ReleaseItemStatus = "changed" | "unchanged" | "failed" | "removed";
export type ReleaseKind = "prototype" | "prd";

export type ReleaseIterationMeta = {
  iterationId?: string | null;
  iterationName?: string | null;
  sessionId?: string | null;
};

export type ReleasePreparePrototype = {
  path: string;
  name: string;
  contentHash: string;
  fileCount: number;
  markCount: number;
  message?: string;
  blobHashes: string[];
};

export type ReleasePreparePrdDocument = {
  path: string;
  name: string;
  title: string;
  contentHash: string;
  lineCount: number;
  wordCount: number;
  message?: string;
};

export type ReleasePrepareResult = {
  releaseId: string;
  projectId: string;
  kind?: ReleaseKind;
  sequenceNumber?: number;
  uploadUrl: string;
  webUrl: string;
  releaseUrl: string;
  missingBlobHashes: string[];
  iteration?: ReleaseIterationMeta | null;
  prototypes: Array<{
    path: string;
    name: string;
    status: "changed" | "unchanged";
    baseVersionId?: string | null;
    latestVersionId?: string | null;
    latestVersionNumber?: number | null;
  }>;
  documents?: Array<{
    path: string;
    name: string;
    title: string;
    status: "changed" | "unchanged";
    latestVersionId?: string | null;
    latestVersionNumber?: number | null;
  }>;
};

export type ReleaseCommitPayload = {
  kind?: ReleaseKind;
  message?: string;
  iteration?: ReleaseIterationMeta | null;
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

export type PrdReleaseCommitPayload = {
  kind: "prd";
  message?: string;
  documents: Array<{
    path: string;
    name: string;
    title: string;
    contentHash: string;
    lineCount: number;
    wordCount: number;
    content: string;
    frontmatter: Record<string, unknown>;
    baseVersionId?: string | null;
  }>;
};

export type ReleaseCommitResult = {
  release: {
    id: string;
    projectId: string;
    kind?: ReleaseKind;
    sequenceNumber?: number;
    message?: string | null;
    status: string;
    createdAt: string;
    webUrl: string;
    releaseUrl: string;
  } & ReleaseIterationMeta;
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

export type PrdReleaseCommitResult = {
  project: {
    id: string;
    slug: string;
    name: string;
  };
  release: {
    id: string;
    projectId: string;
    kind: "prd";
    sequenceNumber: number;
    message?: string | null;
    status: string;
    createdAt: string;
    webUrl: string;
    releaseUrl: string;
  };
  results: Array<{
    documentPath: string;
    documentId: string;
    versionId?: string;
    versionNumber?: number;
    status: ReleaseItemStatus;
    message?: string | null;
  }>;
};

export type PrdReleasePrepareResult = {
  releaseId: string;
  projectId: string;
  kind: "prd";
  sequenceNumber: number;
  uploadUrl: string;
  webUrl: string;
  releaseUrl: string;
  missingBlobHashes: string[];
  documents: Array<{
    path: string;
    name: string;
    title: string;
    status: "changed" | "unchanged";
    latestVersionId?: string | null;
    latestVersionNumber?: number | null;
  }>;
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
