import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { FileSystemError } from './errors.js';

export interface ServerInfo {
  pid: number;
  port: number;
  apiPort?: number;
  mode: 'dev' | 'prod';
  startTime: number;
  projectRoot: string;
}

/**
 * 获取 PID 文件路径
 */
export function getPidFilePath(projectRoot: string = process.cwd()): string {
  return path.join(projectRoot, '.prdkit', 'server.pid');
}

/**
 * 检查进程是否存在
 */
export function isProcessRunning(pid: number): boolean {
  try {
    // 发送信号 0 不会杀死进程，只是检查进程是否存在
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 写入服务信息到 PID 文件
 */
export async function writeServerInfo(info: ServerInfo): Promise<void> {
  const pidFile = getPidFilePath(info.projectRoot);
  const pidDir = path.dirname(pidFile);

  // 确保目录存在
  if (!existsSync(pidDir)) {
    await fs.mkdir(pidDir, { recursive: true });
  }

  await fs.writeFile(pidFile, JSON.stringify(info, null, 2), 'utf-8');
}

/**
 * 读取服务信息
 */
export async function readServerInfo(projectRoot: string = process.cwd()): Promise<ServerInfo | null> {
  const pidFile = getPidFilePath(projectRoot);

  if (!existsSync(pidFile)) {
    return null;
  }

  try {
    const content = await fs.readFile(pidFile, 'utf-8');
    return JSON.parse(content) as ServerInfo;
  } catch (error) {
    throw FileSystemError.readFailed(pidFile, error as Error);
  }
}

/**
 * 删除 PID 文件
 */
export async function removeServerInfo(projectRoot: string = process.cwd()): Promise<void> {
  const pidFile = getPidFilePath(projectRoot);

  if (existsSync(pidFile)) {
    await fs.unlink(pidFile);
  }
}

/**
 * 获取服务状态
 */
export async function getServerStatus(projectRoot: string = process.cwd()): Promise<{
  running: boolean;
  info: ServerInfo | null;
}> {
  const info = await readServerInfo(projectRoot);

  if (!info) {
    return { running: false, info: null };
  }

  // 检查进程是否还在运行
  const running = isProcessRunning(info.pid);

  // 如果进程不存在，清理 PID 文件
  if (!running) {
    await removeServerInfo(projectRoot);
    return { running: false, info: null };
  }

  return { running: true, info };
}
