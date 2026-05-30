/** PRD 文件内容（来自 API） */
export interface PrdContentResponse {
  fileName: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

export interface PrdContextBlock {
  id: string;
  from: number;
  to: number;
  text: string;
  startLine: number;
  endLine: number;
}

export interface PrdSaveResponse {
  fileName: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

/** PRD checkpoint 版本内容（来自 API） */
export interface PrdCheckpointContentResponse {
  checkpointId: string;
  fileName: string;
  title: string;
  kind: string;
  message: string | null;
  createdAt: string;
  content: string;
  frontmatter: Record<string, unknown>;
}
