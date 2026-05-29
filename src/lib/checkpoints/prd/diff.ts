import { collectPrdSnapshot, readPrdBlobSource } from "./snapshot.js";
import { getLatestPrdCheckpointRecord, readPrdBlob, readPrdCheckpointData } from "./store.js";
import type { PrdCheckpointDiffSummary, PrdCheckpointStatus } from "./types.js";

function splitLines(content: string): string[] {
  return content.length === 0 ? [] : content.split("\n");
}

function calculateLineChanges(fromContent: string, toContent: string): { lineAdded: number; lineDeleted: number } {
  const fromLines = splitLines(fromContent);
  const toLines = splitLines(toContent);
  const rows = fromLines.length;
  const cols = toLines.length;
  const dp = Array.from({ length: rows + 1 }, () => Array<number>(cols + 1).fill(0));

  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      dp[i][j] = fromLines[i] === toLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const lcs = dp[0][0];
  return {
    lineAdded: toLines.length - lcs,
    lineDeleted: fromLines.length - lcs,
  };
}

export type DiffLine = { type: 'added'; value: string } | { type: 'removed'; value: string } | { type: 'unchanged'; value: string };

/** 基于 LCS 表生成行级 diff */
function computeLineDiff(fromLines: string[], toLines: string[]): DiffLine[] {
  const rows = fromLines.length;
  const cols = toLines.length;
  const dp = Array.from({ length: rows + 1 }, () => Array<number>(cols + 1).fill(0));

  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      dp[i][j] = fromLines[i] === toLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < rows || j < cols) {
    if (i < rows && j < cols && fromLines[i] === toLines[j]) {
      result.push({ type: 'unchanged', value: fromLines[i] });
      i++; j++;
    } else if (j < cols && (i >= rows || dp[i][j + 1] >= dp[i + 1][j])) {
      result.push({ type: 'added', value: toLines[j] });
      j++;
    } else {
      result.push({ type: 'removed', value: fromLines[i] });
      i++;
    }
  }
  return result;
}

function buildSummary(
  fromCheckpointId: string,
  toCheckpointId: string,
  fromContent: string,
  toContent: string,
  beforeSize: number,
  afterSize: number,
  beforeLineCount: number,
  afterLineCount: number,
): PrdCheckpointDiffSummary {
  const { lineAdded, lineDeleted } = calculateLineChanges(fromContent, toContent);
  return {
    fromCheckpointId,
    toCheckpointId,
    changed: fromContent !== toContent,
    lineAdded,
    lineDeleted,
    beforeSize,
    afterSize,
    beforeLineCount,
    afterLineCount,
  };
}

export async function diffPrdCheckpoints(projectRoot: string, fromCheckpointId: string, toCheckpointId: string): Promise<PrdCheckpointDiffSummary> {
  const from = readPrdCheckpointData(projectRoot, fromCheckpointId);
  const to = readPrdCheckpointData(projectRoot, toCheckpointId);
  const [fromContent, toContent] = await Promise.all([
    readPrdBlob(projectRoot, from.document.blobHash).then((buffer) => buffer.toString("utf8")),
    readPrdBlob(projectRoot, to.document.blobHash).then((buffer) => buffer.toString("utf8")),
  ]);

  return buildSummary(
    fromCheckpointId,
    toCheckpointId,
    fromContent,
    toContent,
    from.document.size,
    to.document.size,
    from.document.lineCount,
    to.document.lineCount,
  );
}

export async function diffCurrentPrdAgainstLatest(projectRoot: string, prdPath: string): Promise<PrdCheckpointStatus> {
  const latest = getLatestPrdCheckpointRecord(projectRoot, prdPath);

  if (!latest) {
    try {
      const current = collectPrdSnapshot(projectRoot, prdPath);
      const currentContent = readPrdBlobSource(projectRoot, current.prdPath).toString("utf8");
      return {
        summary: buildSummary("empty", "working-tree", "", currentContent, 0, current.size, 0, current.lineCount),
        hasChanges: current.size > 0,
      };
    } catch {
      return {
        summary: buildSummary("empty", "working-tree", "", "", 0, 0, 0, 0),
        hasChanges: false,
      };
    }
  }

  const checkpoint = readPrdCheckpointData(projectRoot, latest.id);
  const checkpointContent = await readPrdBlob(projectRoot, checkpoint.document.blobHash).then((buffer) => buffer.toString("utf8"));

  try {
    const current = collectPrdSnapshot(projectRoot, prdPath);
    const currentContent = readPrdBlobSource(projectRoot, current.prdPath).toString("utf8");
    const summary = buildSummary(
      latest.id,
      "working-tree",
      checkpointContent,
      currentContent,
      checkpoint.document.size,
      current.size,
      checkpoint.document.lineCount,
      current.lineCount,
    );
    return {
      latestCheckpointId: latest.id,
      summary,
      hasChanges: summary.changed,
    };
  } catch {
    const summary = buildSummary(
      latest.id,
      "working-tree",
      checkpointContent,
      "",
      checkpoint.document.size,
      0,
      checkpoint.document.lineCount,
      0,
    );
    return {
      latestCheckpointId: latest.id,
      summary,
      hasChanges: true,
    };
  }
}

/** 获取 checkpoint 版本与当前文件的逐行 diff */
export async function diffPrdCheckpointAgainstCurrent(
  projectRoot: string,
  checkpointId: string,
  prdPath: string
): Promise<{ diffLines: DiffLine[]; summary: PrdCheckpointDiffSummary }> {
  const data = readPrdCheckpointData(projectRoot, checkpointId);
  const checkpointContent = await readPrdBlob(projectRoot, data.document.blobHash).then((buf) => buf.toString("utf8"));
  const currentContent = readPrdBlobSource(projectRoot, prdPath).toString("utf8");

  const fromLines = splitLines(checkpointContent);
  const toLines = splitLines(currentContent);
  const diffLines = computeLineDiff(fromLines, toLines);
  const summary = buildSummary(
    checkpointId,
    "working-tree",
    checkpointContent,
    currentContent,
    data.document.size,
    Buffer.byteLength(currentContent),
    data.document.lineCount,
    splitLines(currentContent).length,
  );

  return { diffLines, summary };
}
