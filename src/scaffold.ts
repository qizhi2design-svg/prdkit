import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

function toSshGithub443(repoUrl: string): string {
  const match = repoUrl.match(/^git@github\.com:(.+)$/);
  if (!match) return repoUrl;
  return `ssh://git@ssh.github.com:443/${match[1]}`;
}

async function cloneScaffold(repoUrl: string, branch: string): Promise<string> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prdkit-scaffold-"));
  const checkoutDir = path.join(tempDir, "repo");
  const candidates = [repoUrl, toSshGithub443(repoUrl)];
  let lastError = "";
  for (const candidate of candidates) {
    try {
      await execFileAsync("git", ["clone", "--depth", "1", "--branch", branch, candidate, checkoutDir], {
        encoding: "utf8"
      });
      return checkoutDir;
    } catch (error) {
      await rm(checkoutDir, { recursive: true, force: true });
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`克隆 scaffold 仓库失败：${lastError}`);
}

export async function copyScaffoldInto(targetDir: string, repoUrl: string, branch: string): Promise<void> {
  const checkoutDir = await cloneScaffold(repoUrl, branch);
  try {
    const sourceEntries = await import("node:fs/promises").then(({ readdir }) => readdir(checkoutDir));
    for (const entry of sourceEntries) {
      if (entry === ".git") continue;
      await cp(path.join(checkoutDir, entry), path.join(targetDir, entry), {
        recursive: true,
        force: false,
        errorOnExist: true
      });
    }
  } finally {
    await rm(path.dirname(checkoutDir), { recursive: true, force: true });
  }
}

export async function personalizeReadme(targetDir: string, projectName: string, author: string, date: string): Promise<void> {
  const filePath = path.join(targetDir, "README.md");
  if (!existsSync(filePath)) return;
  const raw = await readFile(filePath, "utf8");
  const replacedTitle = raw.replace(/^#\s+.+$/m, `# ${projectName}`);
  const meta = [``, `> 项目名：${projectName}`, `> 作者：${author}`, `> 初始化日期：${date}`, ``].join("\n");
  const finalContent = replacedTitle.replace(/^#\s+.+$/m, (match) => `${match}\n${meta}`);
  await writeFile(filePath, finalContent, "utf8");
}
