export type LinkSource = "cli-publish" | "viewer-publish" | "manual" | "fetched";

export interface ReleaseLink {
  releaseId: string;
  projectId: string;
  url: string;
  prototypePaths: string[];
  source: LinkSource;
  publishedAt: string;
}

export interface ReleaseLinksRegistry {
  version: 1;
  releases: ReleaseLink[];
}
