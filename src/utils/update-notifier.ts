import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { authStoreDir } from "./config.js";
import { logger } from "./logger.js";

type UpdateCache = {
  packageName: string;
  latestVersion: string;
  checkedAt: string;
};

const UPDATE_CACHE_FILE = path.join(authStoreDir(), "update-check.json");
const UPDATE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const UPDATE_CHECK_TIMEOUT_MS = 800;

export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i += 1) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }

  return 0;
}

function shouldSkipUpdateNotice(argv: string[]): boolean {
  return argv.length === 0
    || argv.includes("-V")
    || argv.includes("--version")
    || argv.includes("-h")
    || argv.includes("--help")
    || argv[0] === "update";
}

function readUpdateCache(): UpdateCache | null {
  if (!existsSync(UPDATE_CACHE_FILE)) {
    return null;
  }

  try {
    const raw = JSON.parse(readFileSync(UPDATE_CACHE_FILE, "utf8")) as Partial<UpdateCache>;
    if (
      typeof raw.packageName !== "string"
      || typeof raw.latestVersion !== "string"
      || typeof raw.checkedAt !== "string"
    ) {
      return null;
    }

    return {
      packageName: raw.packageName,
      latestVersion: raw.latestVersion,
      checkedAt: raw.checkedAt,
    };
  } catch {
    return null;
  }
}

async function saveUpdateCache(cache: UpdateCache): Promise<void> {
  await mkdir(path.dirname(UPDATE_CACHE_FILE), { recursive: true });
  await writeFile(UPDATE_CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

function isCacheFresh(cache: UpdateCache | null, packageName: string): boolean {
  if (!cache || cache.packageName !== packageName) {
    return false;
  }

  const checkedAt = Date.parse(cache.checkedAt);
  if (!Number.isFinite(checkedAt)) {
    return false;
  }

  return Date.now() - checkedAt < UPDATE_CACHE_TTL_MS;
}

function fetchLatestPublishedVersion(packageName: string): string | null {
  try {
    const output = execFileSync("npm", ["view", packageName, "version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: UPDATE_CHECK_TIMEOUT_MS,
      windowsHide: true,
    });
    return output.trim() || null;
  } catch {
    return null;
  }
}

export async function notifyIfCliUpdateAvailable(options: {
  packageName: string;
  currentVersion: string;
  argv: string[];
}): Promise<void> {
  const { packageName, currentVersion, argv } = options;
  if (shouldSkipUpdateNotice(argv)) {
    return;
  }

  let latestVersion: string | null = null;
  const cache = readUpdateCache();

  if (cache?.packageName === packageName) {
    latestVersion = cache.latestVersion;
  }

  if (!isCacheFresh(cache, packageName)) {
    const fetched = fetchLatestPublishedVersion(packageName);
    if (fetched) {
      latestVersion = fetched;
      await saveUpdateCache({
        packageName,
        latestVersion: fetched,
        checkedAt: new Date().toISOString(),
      });
    }
  }

  if (!latestVersion) {
    return;
  }

  if (compareVersions(currentVersion, latestVersion) >= 0) {
    return;
  }

  logger.warn(`检测到 prdkit CLI 新版本：${currentVersion} -> ${latestVersion}`);
  logger.info(`建议执行 prdkit update 更新到 ${latestVersion}`);
}
