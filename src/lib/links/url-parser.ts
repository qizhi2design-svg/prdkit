export interface ParsedReleaseUrl {
  origin: string;
  projectId: string;
  releaseId: string;
}

/** 解析云端 release URL，提取 origin、projectId、releaseId。 */
export function parseReleaseUrl(url: string): ParsedReleaseUrl {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`无法解析 URL：${url}，请提供有效的 URL 格式`);
  }

  const match = parsed.pathname.match(/\/projects\/([^/?]+)/);
  if (!match) {
    throw new Error(
      `URL 路径中未找到项目 ID：${parsed.pathname}，确保 URL 格式为 /projects/{projectId}?releaseId={releaseId}`
    );
  }

  const releaseId = parsed.searchParams.get("releaseId");
  if (!releaseId) {
    throw new Error(
      `URL 查询参数中未找到 releaseId，确保 URL 包含 ?releaseId={releaseId}`
    );
  }

  return {
    origin: parsed.origin,
    projectId: match[1],
    releaseId,
  };
}
