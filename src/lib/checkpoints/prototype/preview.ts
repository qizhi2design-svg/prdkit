import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkpointStoreRoot, readBlob, readCheckpointData } from "./store.js";

export interface MaterializedCheckpointPreview {
  checkpointId: string;
  prototypePath: string;
  previewDir: string;
  entryFilePath: string;
}

export async function materializeCheckpointPreview(
  projectRoot: string,
  checkpointId: string
): Promise<MaterializedCheckpointPreview> {
  const checkpoint = readCheckpointData(projectRoot, checkpointId);
  const previewDir = path.join(checkpointStoreRoot(projectRoot), "previews", checkpointId);

  await mkdir(previewDir, { recursive: true });

  for (const file of checkpoint.files) {
    const outputPath = path.join(previewDir, file.relativePath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, await readBlob(projectRoot, file.blobHash));
  }

  return {
    checkpointId,
    prototypePath: checkpoint.manifest.prototypePath,
    previewDir,
    entryFilePath: path.join(previewDir, "index.html")
  };
}
